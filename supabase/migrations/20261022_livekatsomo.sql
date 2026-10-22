-- Futista: Livekatsomo (ottelukohtainen tekstikeskustelu ylläpidon valitsemiin otteluihin).
-- Aja kerran: Supabase → SQL Editor → tämä tiedosto. Lisää vain uusia tauluja ja funktioita (etuliite lk_).
-- Idempotentti: ajettavissa uudelleen. Ks. docs/livekatsomo.md.
--
-- Turvamalli
--  * Tietokanta on totuuslähde. Kaikki luku ja kirjoitus kulkee Futistan palvelimen kautta (service_role /
--    secret-avain), joka tarkistaa kirjautumisen (Supabase Auth) ennen funktiokutsua.
--  * RLS päällä kaikissa tauluissa, ei käytäntöjä anon/authenticated-rooleille → selaimella ei suoraa pääsyä
--    (ei sähköposteihin, raportteihin, lokeihin, läsnäoloon).
--  * Kirjoitusoikeus (huoneen tila, kielto, lähetysrajat) tarkistetaan funktiossa tietokannan kellolla
--    (now()), joten selaimen kello tai käyttöliittymän tila ei voi avata suljettua keskustelua.
--  * Lähetysrajat: käyttäjäkohtainen transaktiolukko (pg_advisory_xact_lock) → rajat pitävät myös
--    rinnakkaisissa pyynnöissä ja usean palvelininstanssin välillä.
--  * Realtime: tietokanta kokoaa keskustelun muutokset (uudet julkiset viestit, poistot, huoneen tila) enintään
--    yhdeksi Broadcast-lähetykseksi 2 sekunnissa per keskustelu (lk_flush_room) yksityiseen kanavaan
--    livekatsomo:<huone>. Lähetys sisältää vain julkisen viestimuodon (sama kuin julkinen rajapinta).
--    realtime.messages-käytäntö sallii selaimelle vain vastaanoton (ei lähetystä) → kanava ei ohita palvelimen
--    tarkistuksia. Viestien järjestysnumero (seq) per keskustelu → selain huomaa puuttuvat ja hakee ne HTTP:llä.
--  * SECURITY DEFINER -funktioissa tyhjä search_path ja täysin nimetyt objektit.

create extension if not exists pgcrypto;

-- ---------- Asetukset (yksi rivi) ----------
create table if not exists public.lk_settings (
  id int primary key default 1 check (id = 1),
  msg_interval_s int not null default 5,          -- vähintään näin monta sekuntia viestien välillä / käyttäjä
  msg_per_min int not null default 10,            -- enintään viestiä minuutissa / käyttäjä
  links_per_10min int not null default 2,         -- linkkejä sisältäviä viestejä 10 min aikana / käyttäjä
  reports_per_10min int not null default 5,       -- ilmoituksia 10 min aikana / käyttäjä
  guest_sessions_per_ip int not null default 3,   -- vieraiden läsnäoloistuntoja / IP-tunniste / huone
  presence_ttl_s int not null default 75,         -- läsnäolo vanhenee ilman sykettä (syke 30 s)
  retention_days int not null default 7,          -- suljetun keskustelun viestit poistetaan tämän jälkeen
  report_retention_days int not null default 30,  -- ilmoitukset (ja niiden tekstiotteet) poistetaan
  modlog_retention_days int not null default 180, -- moderointiloki
  fallback_close_h int not null default 4,        -- jos loppuvihellystä ei vahvisteta: sulku aloitus + 4 h
  max_featured int not null default 2
);
alter table public.lk_settings add column if not exists enabled boolean not null default true;       -- katkaisin
alter table public.lk_settings add column if not exists batch_s int not null default 2;              -- Realtime-kooste
alter table public.lk_settings add column if not exists rt_max_readers int not null default 150;     -- Realtime-yhteyksiä / keskustelu
alter table public.lk_settings add column if not exists auth_per_email_15min int not null default 3; -- kirjautumislinkit
alter table public.lk_settings add column if not exists auth_per_ip_hour int not null default 10;
alter table public.lk_settings add column if not exists last_flush_at timestamptz;                   -- ajastusten seuranta
alter table public.lk_settings add column if not exists last_purge_at timestamptz;
alter table public.lk_settings alter column presence_ttl_s set default 75;
update public.lk_settings set presence_ttl_s = 75 where id = 1 and presence_ttl_s = 45;
insert into public.lk_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.lk_admins (
  user_id uuid primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.lk_profiles (
  user_id uuid primary key,
  nickname text not null check (char_length(nickname) between 2 and 20),
  nick_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lk_rooms (
  id uuid primary key default gen_random_uuid(),
  match_key text not null check (char_length(match_key) between 3 and 200), -- vakaa: päivä|koti|vieras (normalisoitu)
  match_path text not null check (match_path like '/ottelu/%'),
  source text not null,
  home text not null, away text not null,
  kickoff timestamptz not null,
  opens_at timestamptz not null,
  close_after_ft_min int not null default 60 check (close_after_ft_min between 0 and 1440),
  fallback_close_at timestamptz not null,
  ft_confirmed_at timestamptz,
  manual_state text not null default 'auto' check (manual_state in ('auto', 'open', 'paused', 'closed')),
  read_only boolean not null default false,
  match_status text check (match_status in ('postponed', 'cancelled')),
  slow_mode_s int not null default 0 check (slow_mode_s between 0 and 300),
  pinned text check (pinned is null or char_length(pinned) <= 200),
  featured boolean not null default false,
  closed_at timestamptz,          -- milloin keskustelu todettiin suljetuksi (säilytysajan alku)
  purged_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists lk_rooms_match_live on public.lk_rooms (match_key) where purged_at is null;
alter table public.lk_rooms drop column if exists last_ring;
alter table public.lk_rooms add column if not exists seq bigint not null default 0;        -- viestien järjestysnumero
alter table public.lk_rooms add column if not exists sent_seq bigint not null default 0;   -- Realtimeen lähetetty asti
alter table public.lk_rooms add column if not exists sent_at timestamptz;                  -- viimeisin Realtime-lähetys
alter table public.lk_rooms add column if not exists sent_state text;                      -- tila viimeisessä lähetyksessä
alter table public.lk_rooms add column if not exists room_dirty boolean not null default false;
alter table public.lk_rooms add column if not exists present_cache int;                    -- paikallaolo (välimuisti 10 s)
alter table public.lk_rooms add column if not exists present_at timestamptz;

create table if not exists public.lk_messages (
  id bigserial primary key,
  room uuid not null references public.lk_rooms (id) on delete cascade,
  user_id uuid not null,
  nickname text not null,
  body text check (body is null or char_length(body) between 1 and 300),
  norm text,
  has_link boolean not null default false,
  reply_to bigint references public.lk_messages (id) on delete set null,
  client_id uuid not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by text check (deleted_by in ('self', 'mod')),
  unique (user_id, client_id)
);
create index if not exists lk_messages_room_id on public.lk_messages (room, id);
alter table public.lk_messages add column if not exists seq bigint;
create index if not exists lk_messages_room_seq on public.lk_messages (room, seq);
create index if not exists lk_messages_room_deleted on public.lk_messages (room, deleted_at) where deleted_at is not null;
create index if not exists lk_messages_user_time on public.lk_messages (user_id, created_at desc);

create table if not exists public.lk_reports (
  id bigserial primary key,
  message_id bigint references public.lk_messages (id) on delete set null,
  room uuid references public.lk_rooms (id) on delete cascade,
  reporter uuid not null,
  reason text check (reason is null or char_length(reason) <= 200),
  excerpt text,                 -- tekstiote moderointia varten (poistetaan report_retention_days jälkeen)
  reported_user uuid,
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by uuid,
  unique (message_id, reporter)
);

create table if not exists public.lk_bans (
  id bigserial primary key,
  user_id uuid not null,
  until timestamptz,            -- null = toistaiseksi
  reason text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  lifted_at timestamptz
);
create index if not exists lk_bans_user on public.lk_bans (user_id);

create table if not exists public.lk_mod_log (
  id bigserial primary key,
  room uuid,
  actor uuid not null,
  action text not null,
  target_user uuid,
  target_message bigint,
  detail jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.lk_presence (
  room uuid not null references public.lk_rooms (id) on delete cascade,
  sess text not null check (char_length(sess) between 8 and 64),
  user_id uuid,
  ip_hash text,
  last_seen timestamptz not null default now(),
  primary key (room, sess)
);

-- Kirjautumislinkkipyyntöjen yhteinen rajoitus (tiivisteet; ei sähköposteja eikä IP-osoitteita). Poistetaan 1 vrk.
create table if not exists public.lk_auth_attempts (
  key text not null,            -- 'e:'||tiiviste(sähköposti) tai 'i:'||tiiviste(IP)
  at timestamptz not null default now()
);
create index if not exists lk_auth_attempts_key on public.lk_auth_attempts (key, at);

-- RLS: ei pääsyä selaimelta
do $$ declare t text; begin
  foreach t in array array['lk_settings','lk_admins','lk_profiles','lk_rooms','lk_messages','lk_reports','lk_bans','lk_mod_log','lk_presence','lk_auth_attempts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ---------- Apufunktiot ----------
-- Huoneen todellinen tila tietokannan kellolla: upcoming | open | paused | closed | purged
create or replace function public.lk_room_state(r public.lk_rooms)
returns text language sql stable set search_path = '' as $$
  select case
    when r.purged_at is not null then 'purged'
    when r.manual_state = 'closed' or r.match_status = 'cancelled' then 'closed'
    when now() >= coalesce(r.ft_confirmed_at + make_interval(mins => r.close_after_ft_min), r.fallback_close_at) then 'closed'
    when r.manual_state = 'paused' then 'paused'
    when r.match_status = 'postponed' then 'closed'
    when r.manual_state = 'open' then 'open'
    when now() < r.opens_at then 'upcoming'
    else 'open'
  end
$$;

create or replace function public.lk_closes_at(r public.lk_rooms)
returns timestamptz language sql stable set search_path = '' as $$
  select coalesce(r.ft_confirmed_at + make_interval(mins => r.close_after_ft_min), r.fallback_close_at)
$$;

-- Realtime-ovikello (vain tunniste). Ei virhettä, jos Realtime-laajennusta ei ole (paikallinen testikanta).
drop function if exists public.lk_ring(uuid, text, bigint);

create or replace function public.lk_is_admin(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.lk_admins a where a.user_id = p_user)
$$;

create or replace function public.lk_active_ban(p_user uuid)
returns timestamptz language sql stable security definer set search_path = '' as $$
  -- palauttaa kiellon päättymishetken ('infinity' = toistaiseksi) tai null
  select max(coalesce(b.until, 'infinity'::timestamptz)) from public.lk_bans b
  where b.user_id = p_user and b.lifted_at is null and (b.until is null or b.until > now())
$$;

-- Viestin julkinen muoto (poistettu viesti ei paljasta sisältöään, ei myöskään vastauslainauksessa)
create or replace function public.lk_msg_json(m public.lk_messages)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', m.id, 'seq', m.seq, 'uid', left(md5('lk:' || m.user_id::text), 12), 'nick', m.nickname, 'at', m.created_at,
    'body', case when m.deleted_at is null then m.body end,
    'deleted', m.deleted_by,
    'reply', (select jsonb_build_object('id', p.id, 'nick', p.nickname,
                'body', case when p.deleted_at is null then left(p.body, 80) end, 'deleted', p.deleted_by)
              from public.lk_messages p where p.id = m.reply_to)
  )
$$;

-- ---------- Profiili / nimimerkki ----------
create or replace function public.lk_set_nickname(p_user uuid, p_nick text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_nick text := btrim(regexp_replace(coalesce(p_nick, ''), '\s+', ' ', 'g')); v_key text;
begin
  if p_user is null then raise exception 'auth'; end if;
  if char_length(v_nick) < 2 or char_length(v_nick) > 20 or v_nick !~ '^[[:alnum:]ÅÄÖåäöÉéÜü _.-]+$' then
    return jsonb_build_object('ok', false, 'error', 'nick_invalid');
  end if;
  v_key := lower(regexp_replace(v_nick, '[ _.-]', '', 'g'));
  if v_key ~ '(yllapit|ylläpit|admin|moderaat|futista|official)' then
    return jsonb_build_object('ok', false, 'error', 'nick_reserved');
  end if;
  if exists (select 1 from public.lk_profiles where nick_key = v_key and user_id <> p_user) then
    return jsonb_build_object('ok', false, 'error', 'nick_taken');
  end if;
  insert into public.lk_profiles (user_id, nickname, nick_key) values (p_user, v_nick, v_key)
  on conflict (user_id) do update set nickname = excluded.nickname, nick_key = excluded.nick_key, updated_at = now();
  return jsonb_build_object('ok', true, 'nick', v_nick);
end $$;

create or replace function public.lk_me(p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'uid', left(md5('lk:' || p_user::text), 12),
    'nick', (select nickname from public.lk_profiles where user_id = p_user),
    'admin', public.lk_is_admin(p_user),
    'banned_until', public.lk_active_ban(p_user))
$$;

-- ---------- Lähetys ----------
create or replace function public.lk_send(p_room uuid, p_user uuid, p_client_id uuid, p_body text, p_norm text, p_has_link boolean, p_reply_to bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.lk_settings; r public.lk_rooms; v_nick text; v_ban timestamptz; v_last timestamptz; v_n int;
  v_gap int; v_id bigint; v_existing public.lk_messages; v_state text;
begin
  if p_user is null then raise exception 'auth'; end if;
  -- käyttäjäkohtainen lukko: rinnakkaiset pyynnöt käsitellään peräkkäin (rajat pitävät)
  perform pg_advisory_xact_lock(hashtextextended('lk:' || p_user::text, 0));
  select * into s from public.lk_settings where id = 1;
  if not s.enabled then return jsonb_build_object('ok', false, 'error', 'off'); end if;
  -- sama pyyntötunniste → palautetaan aiempi viesti (uudelleenyritys ei julkaise kahdesti)
  select * into v_existing from public.lk_messages where user_id = p_user and client_id = p_client_id;
  if found then return jsonb_build_object('ok', true, 'dup', true, 'message', public.lk_msg_json(v_existing)); end if;

  select * into r from public.lk_rooms where id = p_room;
  if not found then return jsonb_build_object('ok', false, 'error', 'room'); end if;
  v_state := public.lk_room_state(r);
  if v_state <> 'open' then return jsonb_build_object('ok', false, 'error', 'state_' || v_state); end if;
  if r.read_only then return jsonb_build_object('ok', false, 'error', 'read_only'); end if;

  select nickname into v_nick from public.lk_profiles where user_id = p_user;
  if v_nick is null then return jsonb_build_object('ok', false, 'error', 'nick_required'); end if;
  v_ban := public.lk_active_ban(p_user);
  if v_ban is not null then return jsonb_build_object('ok', false, 'error', 'banned', 'until', v_ban); end if;

  if p_body is null or char_length(p_body) < 1 or char_length(p_body) > 300 or p_norm is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  v_gap := greatest(s.msg_interval_s, r.slow_mode_s);
  select max(created_at) into v_last from public.lk_messages where user_id = p_user;
  if v_last is not null and now() - v_last < make_interval(secs => v_gap) then
    return jsonb_build_object('ok', false, 'error', 'rate', 'retry_s', ceil(extract(epoch from (v_last + make_interval(secs => v_gap) - now()))));
  end if;
  select count(*) into v_n from public.lk_messages where user_id = p_user and created_at > now() - interval '60 seconds';
  if v_n >= s.msg_per_min then return jsonb_build_object('ok', false, 'error', 'rate', 'retry_s', 60); end if;
  if exists (select 1 from public.lk_messages where user_id = p_user and norm = p_norm and created_at > now() - interval '3 minutes') then
    return jsonb_build_object('ok', false, 'error', 'repeat');
  end if;
  if p_has_link then
    select count(*) into v_n from public.lk_messages where user_id = p_user and has_link and created_at > now() - interval '10 minutes';
    if v_n >= s.links_per_10min then return jsonb_build_object('ok', false, 'error', 'links'); end if;
  end if;
  if p_reply_to is not null and not exists (select 1 from public.lk_messages where id = p_reply_to and room = p_room) then
    p_reply_to := null;
  end if;

  -- järjestysnumero keskustelussa (rivilukko → numerot ilman aukkoja sitoutumisjärjestyksessä)
  update public.lk_rooms set seq = seq + 1 where id = p_room returning seq into v_id;
  insert into public.lk_messages (room, user_id, nickname, body, norm, has_link, reply_to, client_id, seq)
    values (p_room, p_user, v_nick, p_body, p_norm, coalesce(p_has_link, false), p_reply_to, p_client_id, v_id)
    returning * into v_existing;
  perform public.lk_flush_room(p_room, false);
  return jsonb_build_object('ok', true, 'message', public.lk_msg_json(v_existing));
end $$;

create or replace function public.lk_delete_own(p_user uuid, p_msg bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.lk_messages;
begin
  update public.lk_messages set deleted_at = now(), deleted_by = 'self', body = null, norm = null
    where id = p_msg and user_id = p_user and deleted_at is null returning * into m;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  perform public.lk_flush_room(m.room, false);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.lk_report(p_user uuid, p_msg bigint, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.lk_settings; m public.lk_messages; v_n int;
begin
  if p_user is null then raise exception 'auth'; end if;
  perform pg_advisory_xact_lock(hashtextextended('lkr:' || p_user::text, 0));
  select * into s from public.lk_settings where id = 1;
  select * into m from public.lk_messages where id = p_msg;
  if not found or m.deleted_at is not null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if m.user_id = p_user then return jsonb_build_object('ok', false, 'error', 'own'); end if;
  select count(*) into v_n from public.lk_reports where reporter = p_user and created_at > now() - interval '10 minutes';
  if v_n >= s.reports_per_10min then return jsonb_build_object('ok', false, 'error', 'rate'); end if;
  -- ilmoitus EI poista eikä piilota viestiä (ei voi käyttää muiden vaientamiseen)
  insert into public.lk_reports (message_id, room, reporter, reason, excerpt, reported_user)
    values (m.id, m.room, p_user, left(p_reason, 200), m.body, m.user_id)
    on conflict (message_id, reporter) do nothing;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- Luku ----------
-- Sivu viestejä: p_after → uudemmat (enintään p_limit, vanhin ensin); p_before → vanhemmat; muuten viimeisimmät
create or replace function public.lk_messages_page(p_room uuid, p_after bigint, p_before bigint, p_limit int)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r public.lk_rooms; v_lim int := least(greatest(coalesce(p_limit, 50), 1), 100); v jsonb;
begin
  if not (select enabled from public.lk_settings where id = 1) then return jsonb_build_object('ok', false, 'error', 'off'); end if;
  select * into r from public.lk_rooms where id = p_room;
  if not found or r.purged_at is not null then return jsonb_build_object('ok', false, 'error', 'room'); end if;
  if p_after is not null then
    select coalesce(jsonb_agg(public.lk_msg_json(m) order by m.id), '[]') into v
      from (select * from public.lk_messages where room = p_room and id > p_after order by id limit v_lim) m;
  elsif p_before is not null then
    select coalesce(jsonb_agg(public.lk_msg_json(m) order by m.id), '[]') into v
      from (select * from public.lk_messages where room = p_room and id < p_before order by id desc limit v_lim) m;
  else
    select coalesce(jsonb_agg(public.lk_msg_json(m) order by m.id), '[]') into v
      from (select * from public.lk_messages where room = p_room order by id desc limit v_lim) m;
  end if;
  return jsonb_build_object('ok', true, 'messages', v,
    'deleted', (select coalesce(jsonb_agg(id), '[]') from public.lk_messages
                where room = p_room and deleted_at > now() - interval '10 minutes'));
end $$;

create or replace function public.lk_room_json(r public.lk_rooms, p_count int)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', r.id, 'match_key', r.match_key, 'path', r.match_path, 'source', r.source,
    'home', r.home, 'away', r.away, 'kickoff', r.kickoff, 'opens_at', r.opens_at,
    'closes_at', public.lk_closes_at(r), 'state', public.lk_room_state(r), 'read_only', r.read_only,
    'match_status', r.match_status, 'slow_mode_s', r.slow_mode_s, 'pinned', r.pinned, 'featured', r.featured,
    'ft_confirmed', r.ft_confirmed_at is not null, 'present', p_count, 'seq', r.seq,
    'rt_full', p_count >= (select rt_max_readers from public.lk_settings where id = 1))
$$;

create or replace function public.lk_presence_count(p_room uuid)
returns int language sql stable security definer set search_path = '' as $$
  select count(distinct coalesce(p.user_id::text, p.sess))::int from public.lk_presence p, public.lk_settings s
  where p.room = p_room and s.id = 1 and p.last_seen > now() - make_interval(secs => s.presence_ttl_s)
$$;

-- Julkinen luettelo: tulevat, avoimet, keskeytetyt ja enintään säilytysajan vanhat suljetut
-- Paikallaolomäärä välimuistista (päivittyy enintään 10 s välein sykkeiden yhteydessä); vanhentunut → lasketaan
create or replace function public.lk_present(r public.lk_rooms)
returns int language sql stable security definer set search_path = '' as $$
  select case when r.present_at > now() - interval '15 seconds' then r.present_cache else public.lk_presence_count(r.id) end
$$;

create or replace function public.lk_rooms_public()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('enabled', s.enabled, 'rooms', case when s.enabled then
    (select coalesce(jsonb_agg(public.lk_room_json(r, public.lk_present(r)) order by r.kickoff), '[]')
       from public.lk_rooms r where r.purged_at is null and r.kickoff > now() - make_interval(days => s.retention_days + 1))
    else '[]'::jsonb end)
  from public.lk_settings s where s.id = 1
$$;

create or replace function public.lk_room_get(p_room uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when not (select enabled from public.lk_settings where id = 1) then jsonb_build_object('error', 'off')
    else coalesce((select public.lk_room_json(r, public.lk_present(r)) from public.lk_rooms r where r.id = p_room),
                  jsonb_build_object('error', 'room')) end
$$;

-- ---------- Läsnäolo ----------
-- Syke: lasketaan vain, kun Livekatsomo on näkyvissä (selain lähettää sykkeen vain silloin).
-- Kirjautunut = yksi käyttäjä (kaikki istunnot). Vieras = lyhytikäinen satunnainen istuntotunniste
-- (samassa selaimessa välilehdet jakavat sen). Vieraiden uusia istuntoja rajoitetaan IP-tunnistetta kohden.
create or replace function public.lk_presence_beat(p_room uuid, p_sess text, p_user uuid, p_ip_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.lk_settings; r public.lk_rooms; v_n int; v_state text; v_counted boolean := false;
begin
  select * into s from public.lk_settings where id = 1;
  if not s.enabled then return jsonb_build_object('ok', false, 'error', 'off'); end if;
  select * into r from public.lk_rooms where id = p_room;
  if not found then return jsonb_build_object('ok', false, 'error', 'room'); end if;
  v_state := public.lk_room_state(r);
  if v_state in ('open', 'paused') and p_sess ~ '^[A-Za-z0-9_-]{8,64}$' then
    v_counted := true;
    if p_user is null and not exists (select 1 from public.lk_presence where room = p_room and sess = p_sess) then
      select count(*) into v_n from public.lk_presence
        where room = p_room and ip_hash = p_ip_hash and user_id is null and last_seen > now() - make_interval(secs => s.presence_ttl_s);
      if v_n >= s.guest_sessions_per_ip then v_counted := false; end if;
    end if;
    if v_counted then
      insert into public.lk_presence (room, sess, user_id, ip_hash, last_seen) values (p_room, p_sess, p_user, p_ip_hash, now())
      on conflict (room, sess) do update set last_seen = now(), user_id = coalesce(excluded.user_id, public.lk_presence.user_id);
    end if;
  end if;
  -- määrä lasketaan enintään 10 s välein (ei jokaisella sykkeellä); vanhentuneet poistetaan samalla
  if r.present_at is null or r.present_at < now() - interval '10 seconds' then
    delete from public.lk_presence where room = p_room and last_seen < now() - make_interval(secs => s.presence_ttl_s);
    v_n := public.lk_presence_count(p_room);
    update public.lk_rooms set present_cache = v_n, present_at = now()
      where id = p_room and (present_at is null or present_at < now() - interval '10 seconds');
  else
    v_n := r.present_cache;
  end if;
  return jsonb_build_object('ok', true, 'counted', v_counted, 'present', v_n);
end $$;

create or replace function public.lk_presence_leave(p_room uuid, p_sess text)
returns void language sql security definer set search_path = '' as $$
  delete from public.lk_presence where room = p_room and sess = p_sess;
  update public.lk_rooms set present_at = null where id = p_room; -- määrä lasketaan uudelleen seuraavalla kerralla
$$;

-- Loppuvihellys vahvistettu (palvelin kutsuu, kun lähde ilmoittaa ottelun päättyneeksi)
create or replace function public.lk_confirm_ft(p_room uuid, p_at timestamptz)
returns void language sql security definer set search_path = '' as $$
  update public.lk_rooms set ft_confirmed_at = least(coalesce(p_at, now()), now())
  where id = p_room and ft_confirmed_at is null and p_at > kickoff
$$;

-- ---------- Realtime-kooste ----------
-- Kokoaa keskustelun muutokset yhdeksi Broadcast-lähetykseksi: uudet viestit (seq > sent_seq, enintään 50),
-- poistot edellisen lähetyksen jälkeen ja huoneen tila (jos muuttui). Enintään yksi lähetys batch_s sekunnissa
-- per keskustelu (p_force ohittaa: ylläpidon toimet). Lukko ohitetaan, jos toinen kutsu on kesken
-- (skip locked) → lähetykset eivät jonoudu. Ajastus (lk_flush_all, 2 s välein) lähettää väliin jääneet.
-- Ei virhettä, jos Realtimea ei ole (paikallinen testikanta ilman realtime-skeemaa).
create or replace function public.lk_flush_room(p_room uuid, p_force boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare s public.lk_settings; r public.lk_rooms; v_state text; v_msgs jsonb; v_to bigint; v_del jsonb; v_room jsonb; v_payload jsonb;
begin
  select * into s from public.lk_settings where id = 1;
  select * into r from public.lk_rooms where id = p_room for update skip locked;
  if not found or r.purged_at is not null then return false; end if;
  if not p_force and r.sent_at is not null and r.sent_at > now() - make_interval(secs => s.batch_s) then return false; end if;
  v_state := case when s.enabled then public.lk_room_state(r) else 'off' end;
  select coalesce(jsonb_agg(public.lk_msg_json(m) order by m.seq), '[]'), max(m.seq) into v_msgs, v_to
    from (select * from public.lk_messages where room = p_room and seq > r.sent_seq order by seq limit 50) m;
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'by', m.deleted_by)), '[]') into v_del
    from public.lk_messages m where m.room = p_room and m.deleted_at is not null
      and m.deleted_at > coalesce(r.sent_at, '-infinity'::timestamptz) and m.deleted_at <= now();
  if r.room_dirty or v_state is distinct from r.sent_state then
    v_room := case when v_state = 'off' then null else public.lk_room_json(r, public.lk_present(r)) end;
  end if;
  if jsonb_array_length(v_msgs) = 0 and jsonb_array_length(v_del) = 0 and v_room is null and v_state is not distinct from r.sent_state then
    return false;
  end if;
  v_payload := jsonb_build_object('from', r.sent_seq + 1, 'to', coalesce(v_to, r.sent_seq), 'seq', r.seq,
    'msgs', v_msgs, 'del', v_del, 'room', v_room, 'off', v_state = 'off');
  begin
    execute 'select realtime.send($1, $2, $3, true)' using v_payload, 'batch', 'livekatsomo:' || p_room::text;
  exception when others then null;
  end;
  update public.lk_rooms set sent_seq = coalesce(v_to, sent_seq), sent_at = now(), sent_state = v_state, room_dirty = false
    where id = p_room;
  return true;
end $$;

-- Ajastus (pg_cron, 2 s): avoimet ja tilaa vaihtaneet keskustelut. Kirjaa ajohetken tarkistusta varten.
create or replace function public.lk_flush_all()
returns int language plpgsql security definer set search_path = '' as $$
declare r public.lk_rooms; v_n int := 0; s public.lk_settings;
begin
  select * into s from public.lk_settings where id = 1;
  for r in select * from public.lk_rooms x where x.purged_at is null
      and (x.seq > x.sent_seq or x.room_dirty or x.sent_state is null
           or x.sent_state is distinct from (case when s.enabled then public.lk_room_state(x) else 'off' end)
           or exists (select 1 from public.lk_messages m where m.room = x.id and m.deleted_at > coalesce(x.sent_at, '-infinity'::timestamptz)))
  loop
    if public.lk_flush_room(r.id, false) then v_n := v_n + 1; end if;
  end loop;
  update public.lk_settings set last_flush_at = now() where id = 1;
  return v_n;
end $$;

-- Ajastukset ylläpidon tarkistukseen (pg_cron ei ehkä ole asennettu → tyhjä)
create or replace function public.lk_cron_jobs()
returns setof jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  return query execute 'select jsonb_build_object(''jobname'', jobname, ''schedule'', schedule) from cron.job where jobname like ''livekatsomo%''';
exception when others then return;
end $$;

-- Kirjautumislinkkien yhteinen rajoitus (kaikki palvelininstanssit): tiivisteet, ei henkilötietoja
create or replace function public.lk_auth_attempt(p_email_hash text, p_ip_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare s public.lk_settings;
begin
  select * into s from public.lk_settings where id = 1;
  perform pg_advisory_xact_lock(hashtextextended('lka:' || p_ip_hash, 0));
  if (select count(*) from public.lk_auth_attempts where key = 'e:' || p_email_hash and at > now() - interval '15 minutes') >= s.auth_per_email_15min
     or (select count(*) from public.lk_auth_attempts where key = 'i:' || p_ip_hash and at > now() - interval '1 hour') >= s.auth_per_ip_hour then
    return false;
  end if;
  insert into public.lk_auth_attempts (key) values ('e:' || p_email_hash), ('i:' || p_ip_hash);
  return true;
end $$;

-- ---------- Ylläpito ----------
create or replace function public.lk_admin(p_user uuid, p_action text, p_args jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.lk_settings; r public.lk_rooms; v_room uuid; v_id bigint; m public.lk_messages; v jsonb; v_n int; v_room_user uuid;
begin
  if p_user is null or not public.lk_is_admin(p_user) then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  select * into s from public.lk_settings where id = 1;
  v_room := nullif(p_args->>'room', '')::uuid;

  if p_action = 'create_room' then
    insert into public.lk_rooms (match_key, match_path, source, home, away, kickoff, opens_at, fallback_close_at, close_after_ft_min)
    values (p_args->>'match_key', p_args->>'path', p_args->>'source', p_args->>'home', p_args->>'away',
            (p_args->>'kickoff')::timestamptz,
            coalesce((p_args->>'opens_at')::timestamptz, (p_args->>'kickoff')::timestamptz - interval '30 minutes'),
            (p_args->>'kickoff')::timestamptz + make_interval(hours => s.fallback_close_h),
            coalesce((p_args->>'close_after_ft_min')::int, 60))
    on conflict (match_key) where purged_at is null do update set match_path = excluded.match_path
    returning * into r;
    insert into public.lk_mod_log (room, actor, action, detail) values (r.id, p_user, p_action, p_args);
    return jsonb_build_object('ok', true, 'room', public.lk_room_json(r, 0));

  elsif p_action = 'update_room' then
    select * into r from public.lk_rooms where id = v_room for update;
    if not found then return jsonb_build_object('ok', false, 'error', 'room'); end if;
    if (p_args ? 'featured') and (p_args->>'featured')::boolean and not r.featured then
      select count(*) into v_n from public.lk_rooms x where x.featured and x.purged_at is null and public.lk_room_state(x) in ('upcoming', 'open', 'paused');
      if v_n >= s.max_featured then return jsonb_build_object('ok', false, 'error', 'max_featured'); end if;
    end if;
    update public.lk_rooms set
      opens_at = coalesce((p_args->>'opens_at')::timestamptz, opens_at),
      close_after_ft_min = coalesce((p_args->>'close_after_ft_min')::int, close_after_ft_min),
      fallback_close_at = coalesce((p_args->>'fallback_close_at')::timestamptz, fallback_close_at),
      ft_confirmed_at = case when p_args ? 'ft_confirmed_at' then nullif(p_args->>'ft_confirmed_at', '')::timestamptz else ft_confirmed_at end,
      manual_state = coalesce(p_args->>'manual_state', manual_state),
      read_only = coalesce((p_args->>'read_only')::boolean, read_only),
      match_status = case when p_args ? 'match_status' then nullif(p_args->>'match_status', '') else match_status end,
      slow_mode_s = coalesce((p_args->>'slow_mode_s')::int, slow_mode_s),
      pinned = case when p_args ? 'pinned' then nullif(left(p_args->>'pinned', 200), '') else pinned end,
      featured = coalesce((p_args->>'featured')::boolean, featured)
    where id = v_room returning * into r;
    insert into public.lk_mod_log (room, actor, action, detail) values (r.id, p_user, p_action, p_args);
    update public.lk_rooms set room_dirty = true where id = r.id;
    perform public.lk_flush_room(r.id, true);
    return jsonb_build_object('ok', true, 'room', public.lk_room_json(r, public.lk_present(r)));

  elsif p_action = 'delete_message' then
    v_id := (p_args->>'message')::bigint;
    update public.lk_messages set deleted_at = now(), deleted_by = 'mod', body = null, norm = null
      where id = v_id and deleted_at is null returning * into m;
    if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    update public.lk_reports set handled_at = now(), handled_by = p_user where message_id = v_id and handled_at is null;
    insert into public.lk_mod_log (room, actor, action, target_user, target_message, detail)
      values (m.room, p_user, p_action, m.user_id, m.id, jsonb_build_object('reason', p_args->>'reason'));
    perform public.lk_flush_room(m.room, true);
    return jsonb_build_object('ok', true);

  elsif p_action = 'ban' then
    -- kielto viestin perusteella (selain ei näe käyttäjätunnisteita) tai käyttäjätunnisteella
    select coalesce(nullif(p_args->>'user', '')::uuid, (select user_id from public.lk_messages where id = (p_args->>'message')::bigint))
      into v_room_user;
    if v_room_user is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    insert into public.lk_bans (user_id, until, reason, created_by)
      values (v_room_user, nullif(p_args->>'until', '')::timestamptz, left(p_args->>'reason', 200), p_user);
    insert into public.lk_mod_log (room, actor, action, target_user, detail)
      values (v_room, p_user, p_action, v_room_user, p_args);
    return jsonb_build_object('ok', true);

  elsif p_action = 'unban' then
    select coalesce(nullif(p_args->>'user', '')::uuid, (select user_id from public.lk_messages where id = (p_args->>'message')::bigint))
      into v_room_user;
    update public.lk_bans set lifted_at = now() where user_id = v_room_user and lifted_at is null;
    insert into public.lk_mod_log (room, actor, action, target_user) values (v_room, p_user, p_action, v_room_user);
    return jsonb_build_object('ok', true);

  elsif p_action = 'resolve_report' then
    update public.lk_reports set handled_at = now(), handled_by = p_user where id = (p_args->>'report')::bigint;
    insert into public.lk_mod_log (room, actor, action, detail) values (v_room, p_user, p_action, p_args);
    return jsonb_build_object('ok', true);

  elsif p_action = 'reports' then
    select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'message', x.message_id, 'room', x.room, 'reason', x.reason,
             'excerpt', x.excerpt,
             'nick', (select nickname from public.lk_profiles where user_id = x.reported_user),
             'count', (select count(*) from public.lk_reports y where y.message_id = x.message_id), 'at', x.created_at) order by x.created_at desc), '[]')
      into v from (select distinct on (message_id) * from public.lk_reports where handled_at is null order by message_id, created_at desc) x;
    return jsonb_build_object('ok', true, 'reports', v);

  elsif p_action = 'log' then
    select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'room', l.room, 'action', l.action, 'target_user', l.target_user,
             'target_message', l.target_message, 'detail', l.detail, 'at', l.created_at) order by l.id desc), '[]')
      into v from (select * from public.lk_mod_log order by id desc limit 100) l;
    return jsonb_build_object('ok', true, 'log', v);

  elsif p_action = 'rooms' then
    select coalesce(jsonb_agg(public.lk_room_json(x, public.lk_present(x)) order by x.kickoff desc), '[]')
      into v from public.lk_rooms x where x.purged_at is null;
    return jsonb_build_object('ok', true, 'rooms', v);

  elsif p_action = 'status' then
    return jsonb_build_object('ok', true, 'enabled', s.enabled, 'last_flush_at', s.last_flush_at, 'last_purge_at', s.last_purge_at,
      'rt_max_readers', s.rt_max_readers, 'batch_s', s.batch_s, 'presence_ttl_s', s.presence_ttl_s,
      'cron', (select coalesce(jsonb_agg(jsonb_build_object('name', j->>'jobname', 'schedule', j->>'schedule')), '[]')
               from public.lk_cron_jobs() j));

  elsif p_action = 'set_enabled' then
    -- katkaisin: false → kirjoitukset, paikallaolo ja luku estetään heti ja avoimille Realtime-tilaajille lähtee 'off'
    update public.lk_settings set enabled = coalesce((p_args->>'enabled')::boolean, enabled) where id = 1;
    insert into public.lk_mod_log (actor, action, detail) values (p_user, p_action, p_args);
    perform public.lk_flush_all();
    return jsonb_build_object('ok', true, 'enabled', (select enabled from public.lk_settings where id = 1));
  end if;
  return jsonb_build_object('ok', false, 'error', 'action');
end $$;

-- ---------- Säilytys ----------
-- Suljettujen keskustelujen viestit poistetaan retention_days jälkeen sulkemisesta (huone merkitään purged).
-- Ilmoitukset tekstiotteineen report_retention_days, moderointiloki modlog_retention_days, läsnäolo heti vanhettuaan.
create or replace function public.lk_purge()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.lk_settings; v_rooms int := 0; v_msgs int := 0; v_rep int; v_log int; v_pres int; v_bans int; v_auth int;
begin
  select * into s from public.lk_settings where id = 1;
  -- sulkemishetki talteen (säilytysajan alku): automaattinen sulku = sulkemisaika, käsin suljettu = havaintohetki
  update public.lk_rooms r set closed_at = least(now(), coalesce(public.lk_closes_at(r), now()))
    where r.purged_at is null and r.closed_at is null and public.lk_room_state(r) = 'closed';
  with gone as (
    update public.lk_rooms r set purged_at = now()
    where r.purged_at is null and r.closed_at < now() - make_interval(days => s.retention_days)
      and public.lk_room_state(r) = 'closed'
    returning id)
  select count(*) into v_rooms from gone;
  -- vain arkistoitujen keskustelujen viestit (ja niiden vastauslainaukset samassa keskustelussa)
  with del as (delete from public.lk_messages m using public.lk_rooms r where m.room = r.id and r.purged_at is not null returning 1)
  select count(*) into v_msgs from del;
  with d as (delete from public.lk_reports where created_at < now() - make_interval(days => s.report_retention_days) returning 1) select count(*) into v_rep from d;
  with d as (delete from public.lk_mod_log where created_at < now() - make_interval(days => s.modlog_retention_days) returning 1) select count(*) into v_log from d;
  with d as (delete from public.lk_presence where last_seen < now() - make_interval(secs => s.presence_ttl_s) returning 1) select count(*) into v_pres from d;
  -- päättyneet ja poistetut kiellot 30 vrk jälkeen (voimassa olevat säilyvät)
  with d as (delete from public.lk_bans where coalesce(lifted_at, until) < now() - interval '30 days' returning 1) select count(*) into v_bans from d;
  with d as (delete from public.lk_auth_attempts where at < now() - interval '1 day' returning 1) select count(*) into v_auth from d;
  update public.lk_settings set last_purge_at = now() where id = 1;
  return jsonb_build_object('rooms_purged', v_rooms, 'messages_deleted', v_msgs, 'reports_deleted', v_rep, 'modlog_deleted', v_log,
    'presence_deleted', v_pres, 'bans_deleted', v_bans, 'auth_attempts_deleted', v_auth);
end $$;

-- Realtime-kanavien oikeudet (vain jos Supabase Realtime on käytössä): selain saa VASTAANOTTAA
-- livekatsomo:*-ovikellot, mutta ei lähettää niitä (ei INSERT-käytäntöä). Paikallisessa testikannassa ohitetaan.
do $$ begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists lk_doorbell_receive on realtime.messages';
    execute $p$create policy lk_doorbell_receive on realtime.messages for select to anon, authenticated
             using (realtime.topic() like 'livekatsomo:%' and extension = 'broadcast')$p$;
  end if;
end $$;

-- Funktiot vain palvelimelle
do $$ declare f text; begin
  foreach f in array array[
    'lk_room_state(public.lk_rooms)', 'lk_closes_at(public.lk_rooms)', 'lk_is_admin(uuid)', 'lk_present(public.lk_rooms)',
    'lk_flush_room(uuid,boolean)', 'lk_flush_all()', 'lk_cron_jobs()', 'lk_auth_attempt(text,text)',
    'lk_active_ban(uuid)', 'lk_msg_json(public.lk_messages)', 'lk_set_nickname(uuid,text)', 'lk_me(uuid)',
    'lk_send(uuid,uuid,uuid,text,text,boolean,bigint)', 'lk_delete_own(uuid,bigint)', 'lk_report(uuid,bigint,text)',
    'lk_messages_page(uuid,bigint,bigint,int)', 'lk_room_json(public.lk_rooms,int)', 'lk_presence_count(uuid)',
    'lk_rooms_public()', 'lk_room_get(uuid)', 'lk_presence_beat(uuid,text,uuid,text)', 'lk_presence_leave(uuid,text)',
    'lk_confirm_ft(uuid,timestamptz)', 'lk_admin(uuid,text,jsonb)', 'lk_purge()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
grant select, insert, update, delete on public.lk_settings, public.lk_admins, public.lk_profiles, public.lk_rooms,
  public.lk_messages, public.lk_reports, public.lk_bans, public.lk_mod_log, public.lk_presence, public.lk_auth_attempts to service_role;
grant usage, select on all sequences in schema public to service_role;
