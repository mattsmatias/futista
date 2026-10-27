-- Futista Fantasy (ensimmäinen versio). Aja kerran: Supabase → SQL Editor → tämä tiedosto.
-- Lisää vain uusia tauluja ja funktioita (etuliite fantasy_ / f_); ei muuta olemassa olevia. Idempotentti.
--
-- Turvallisuus
--  * Kaikissa tauluissa RLS päällä ilman käytäntöjä anonille/authenticatedille → selain ei pääse tauluihin suoraan.
--  * Kaikki käsittely palvelimen kautta (secret / service_role -avain) SECURITY DEFINER -funktioilla; tyhjä search_path.
--  * Omistajuus tarkistetaan funktioissa (joukkue kuuluu käyttäjälle, liiga vaatii jäsenyyden, koodin vaihto omistajalle).
--  * Määräaika tarkistetaan tietokannan kellolla (now()); selain ei päätä, onko muutos ajoissa.
--  * Salasanoista vain palvelimella laskettu scrypt-tiiviste; istunnoista vain tunnisteen SHA-256-tiiviste.
--
-- Poisto (tarvittaessa): drop schema-objektit, joiden nimi alkaa fantasy_ tai f_ (ks. lopun kommentti).

-- ---------------- Tilit ja istunnot ----------------
create table if not exists public.fantasy_users (
  id          bigint generated always as identity primary key,
  username    text not null check (username ~ '^[a-z0-9_]{3,24}$'),
  pass_hash   text not null check (char_length(pass_hash) between 40 and 300),
  created_at  timestamptz not null default now()
);
create unique index if not exists fantasy_users_username on public.fantasy_users (username);

create table if not exists public.fantasy_sessions (
  token_hash  text primary key check (char_length(token_hash) = 64),
  user_id     bigint not null references public.fantasy_users(id) on delete cascade,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists fantasy_sessions_user on public.fantasy_sessions (user_id);

create table if not exists public.fantasy_throttle (
  key          text primary key check (char_length(key) between 1 and 200),
  window_start timestamptz not null,
  count        integer not null
);

-- ---------------- Kilpailu, pelaajat, kierrokset, ottelut ----------------
create table if not exists public.fantasy_comps (
  id              text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  name            text not null,
  af_league       integer not null,
  season          integer not null,
  budget          numeric(5,1) not null default 100.0,
  sync_started_at timestamptz,
  sync_ok_at      timestamptz,
  sync_error      text,
  sync_error_at   timestamptz,
  created_at      timestamptz not null default now()
);

create table if not exists public.fantasy_players (
  comp         text not null references public.fantasy_comps(id) on delete cascade,
  player_id    integer not null,
  name         text not null,
  team_id      integer not null,
  team_name    text not null,
  team_logo    text,
  position     text not null check (position in ('GK','DEF','MID','FWD')),
  price        numeric(4,1) not null check (price between 3.5 and 15.0),
  price_source text not null default 'auto' check (price_source in ('auto','admin')),
  active       boolean not null default true,
  photo        text,
  updated_at   timestamptz not null default now(),
  primary key (comp, player_id)
);

create table if not exists public.fantasy_rounds (
  comp          text not null references public.fantasy_comps(id) on delete cascade,
  round_no      integer not null check (round_no > 0),
  label         text not null,
  deadline_at   timestamptz not null,
  first_kickoff timestamptz not null,
  locked_at     timestamptz,           -- kun kierroksen joukkueista on otettu muuttumaton tilannekuva
  status        text not null default 'upcoming' check (status in ('upcoming','live','provisional','final')),
  primary key (comp, round_no)
);

create table if not exists public.fantasy_fixtures (
  comp        text not null references public.fantasy_comps(id) on delete cascade,
  fixture_id  integer not null,
  round_no    integer not null,
  kickoff     timestamptz,
  status      text not null,
  home_id     integer not null,
  away_id     integer not null,
  home_name   text not null,
  away_name   text not null,
  home_goals  integer,
  away_goals  integer,
  consistent  boolean,            -- tapahtumien maalit täsmäävät lopputulokseen (nollapelit vain kun true tai 0 päästettyä)
  stats_at    timestamptz,        -- milloin pelaajatilastot viimeksi tallennettiin
  updated_at  timestamptz not null default now(),
  primary key (comp, fixture_id)
);
create index if not exists fantasy_fixtures_round on public.fantasy_fixtures (comp, round_no);

create table if not exists public.fantasy_player_stats (
  comp        text not null,
  fixture_id  integer not null,
  player_id   integer not null,
  team_id     integer not null,
  minutes     integer not null check (minutes >= 0),
  goals       integer not null default 0,
  assists     integer not null default 0,
  saves       integer,             -- null = lähde ei kerro
  yellow      integer not null default 0,
  red         integer not null default 0,
  conceded    integer,             -- päästetyt maalit pelaajan kentälläoloaikana; null = ei voida määrittää luotettavasti
  primary key (comp, fixture_id, player_id),
  foreign key (comp, fixture_id) references public.fantasy_fixtures(comp, fixture_id) on delete cascade
);

-- ---------------- Joukkueet, valinnat, siirrot, pisteet ----------------
create table if not exists public.fantasy_teams (
  id          bigint generated always as identity primary key,
  comp        text not null references public.fantasy_comps(id) on delete cascade,
  user_id     bigint not null references public.fantasy_users(id) on delete cascade,
  name        text not null check (char_length(name) between 2 and 30),
  first_round integer,             -- ensimmäinen kierros, johon joukkue ehti (asetetaan ensimmäisessä tallennuksessa)
  version     integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (comp, user_id)
);

-- Valinnat versioina: rivi pätee kierroksesta from_round alkaen, kunnes uudempi rivi korvaa sen.
create table if not exists public.fantasy_picks (
  team_id     bigint not null references public.fantasy_teams(id) on delete cascade,
  from_round  integer not null,
  picks       jsonb not null,
  saved_at    timestamptz not null default now(),
  primary key (team_id, from_round)
);

create table if not exists public.fantasy_round_transfers (
  team_id     bigint not null references public.fantasy_teams(id) on delete cascade,
  round_no    integer not null,
  transfers   integer not null check (transfers >= 0),
  cost        integer not null check (cost >= 0),
  primary key (team_id, round_no)
);

-- Muuttumaton tilannekuva kierroksen määräajalta (pisteytys perustuu tähän)
create table if not exists public.fantasy_gw_picks (
  team_id     bigint not null references public.fantasy_teams(id) on delete cascade,
  round_no    integer not null,
  picks       jsonb not null,
  hits        integer not null default 0,
  created_at  timestamptz not null default now(),
  primary key (team_id, round_no)
);

create table if not exists public.fantasy_round_points (
  team_id     bigint not null references public.fantasy_teams(id) on delete cascade,
  round_no    integer not null,
  points      integer not null,    -- pelaajien pisteet kapteenikertoimineen
  hits        integer not null default 0,
  total       integer not null,    -- points - hits
  breakdown   jsonb not null,
  provisional boolean not null,
  computed_at timestamptz not null default now(),
  primary key (team_id, round_no)
);

-- ---------------- Liigat ----------------
create table if not exists public.fantasy_leagues (
  id          bigint generated always as identity primary key,
  comp        text not null references public.fantasy_comps(id) on delete cascade,
  name        text not null check (char_length(name) between 2 and 40),
  owner_team  bigint not null references public.fantasy_teams(id) on delete cascade,
  code        text not null check (code ~ '^[A-Z2-9]{8}$'),
  created_at  timestamptz not null default now()
);
create unique index if not exists fantasy_leagues_code on public.fantasy_leagues (code);

create table if not exists public.fantasy_league_members (
  league_id   bigint not null references public.fantasy_leagues(id) on delete cascade,
  team_id     bigint not null references public.fantasy_teams(id) on delete cascade,
  joined_at   timestamptz not null default now(),
  primary key (league_id, team_id)
);

do $$ declare t text; begin
  foreach t in array array['fantasy_users','fantasy_sessions','fantasy_throttle','fantasy_comps','fantasy_players','fantasy_rounds',
    'fantasy_fixtures','fantasy_player_stats','fantasy_teams','fantasy_picks','fantasy_round_transfers','fantasy_gw_picks',
    'fantasy_round_points','fantasy_leagues','fantasy_league_members'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

-- =====================================================================
-- Funktiot (vain service_role). Paluuarvo jsonb.
-- =====================================================================

-- Tilit
create or replace function public.f_user_create(p_username text, p_pass_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  insert into public.fantasy_users (username, pass_hash) values (lower(p_username), p_pass_hash) returning id into v_id;
  return jsonb_build_object('id', v_id);
exception when unique_violation then return jsonb_build_object('error', 'taken');
end $$;

create or replace function public.f_user_by_name(p_username text) returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object('id', id, 'username', username, 'pass_hash', pass_hash) from public.fantasy_users where username = lower(p_username)
$$;

create or replace function public.f_session_create(p_token_hash text, p_user bigint, p_days integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.fantasy_sessions where user_id = p_user and expires_at < now();
  insert into public.fantasy_sessions (token_hash, user_id, expires_at) values (p_token_hash, p_user, now() + make_interval(days => greatest(1, least(p_days, 60))));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.f_session_get(p_token_hash text) returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object('user_id', u.id, 'username', u.username)
  from public.fantasy_sessions s join public.fantasy_users u on u.id = s.user_id
  where s.token_hash = p_token_hash and s.expires_at > now()
$$;

create or replace function public.f_session_delete(p_token_hash text) returns jsonb
language sql security definer set search_path = '' as $$
  with d as (delete from public.fantasy_sessions where token_hash = p_token_hash returning 1) select jsonb_build_object('ok', true)
$$;

-- Yritysrajoitin (kirjautuminen, rekisteröinti, liittymiskoodit): enintään p_max yritystä p_window_s sekunnissa avainta kohden
create or replace function public.f_throttle(p_key text, p_window_s integer, p_max integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  insert into public.fantasy_throttle as t (key, window_start, count) values (p_key, now(), 1)
  on conflict (key) do update set
    count = case when t.window_start < now() - make_interval(secs => p_window_s) then 1 else t.count + 1 end,
    window_start = case when t.window_start < now() - make_interval(secs => p_window_s) then now() else t.window_start end
  returning count into v_count;
  return jsonb_build_object('allowed', v_count <= p_max);
end $$;

-- Kilpailu ja synkronointi
create or replace function public.f_comp_ensure(p_comp text, p_name text, p_af integer, p_season integer) returns jsonb
language sql security definer set search_path = '' as $$
  insert into public.fantasy_comps (id, name, af_league, season) values (p_comp, p_name, p_af, p_season)
  on conflict (id) do update set name = excluded.name
  returning jsonb_build_object('id', id, 'budget', budget, 'sync_ok_at', sync_ok_at, 'sync_error', sync_error, 'sync_error_at', sync_error_at)
$$;

-- Yksi päivittäjä kerrallaan: true, jos edellisestä onnistuneesta yli p_min_s ja käynnissä olevaa ei ole (tai se on jumissa yli p_stale_s)
create or replace function public.f_sync_claim(p_comp text, p_min_s integer, p_stale_s integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_ok boolean;
begin
  update public.fantasy_comps set sync_started_at = now()
  where id = p_comp
    and (sync_ok_at is null or sync_ok_at < now() - make_interval(secs => p_min_s))
    and (sync_started_at is null or sync_started_at < now() - make_interval(secs => p_stale_s) or (sync_ok_at is not null and sync_started_at <= sync_ok_at)
         or (sync_error_at is not null and sync_started_at <= sync_error_at))
  returning true into v_ok;
  return jsonb_build_object('claim', coalesce(v_ok, false));
end $$;

create or replace function public.f_sync_done(p_comp text, p_ok boolean, p_error text) returns jsonb
language sql security definer set search_path = '' as $$
  update public.fantasy_comps set
    sync_ok_at = case when p_ok then now() else sync_ok_at end,
    sync_error = case when p_ok then null else left(p_error, 300) end,
    sync_error_at = case when p_ok then sync_error_at else now() end
  where id = p_comp returning jsonb_build_object('ok', true)
$$;

-- Pelaajat: uudet lisätään laskettuine hintoineen; olemassa olevien nimi/seura/pelipaikka päivittyvät, hinta EI muutu.
-- p_full = true: listasta puuttuvat merkitään epäaktiivisiksi (ei poisteta, koska ne voivat olla joukkueissa).
create or replace function public.f_players_upsert(p_comp text, p_rows jsonb, p_full boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  insert into public.fantasy_players as p (comp, player_id, name, team_id, team_name, team_logo, position, price, photo, active, updated_at)
  select p_comp, (r->>'player_id')::int, r->>'name', (r->>'team_id')::int, r->>'team_name', r->>'team_logo', r->>'position',
         (r->>'price')::numeric, r->>'photo', true, now()
  from jsonb_array_elements(p_rows) r
  on conflict (comp, player_id) do update set
    name = excluded.name, team_id = excluded.team_id, team_name = excluded.team_name, team_logo = excluded.team_logo,
    position = excluded.position, photo = excluded.photo, active = true, updated_at = now();
  get diagnostics v_n = row_count;
  if p_full then
    update public.fantasy_players set active = false, updated_at = now()
    where comp = p_comp and active and player_id not in (select (r->>'player_id')::int from jsonb_array_elements(p_rows) r);
  end if;
  return jsonb_build_object('upserted', v_n);
end $$;

create or replace function public.f_price_set(p_comp text, p_player integer, p_price numeric) returns jsonb
language sql security definer set search_path = '' as $$
  update public.fantasy_players set price = round(p_price, 1), price_source = 'admin', updated_at = now()
  where comp = p_comp and player_id = p_player
  returning jsonb_build_object('player_id', player_id, 'price', price)
$$;

-- Kierrokset: määräaika ja ensimmäinen ottelu päivittyvät vain lukitsemattomille kierroksille
create or replace function public.f_rounds_upsert(p_comp text, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.fantasy_rounds as r (comp, round_no, label, deadline_at, first_kickoff, status)
  select p_comp, (x->>'round_no')::int, x->>'label', (x->>'deadline_at')::timestamptz, (x->>'first_kickoff')::timestamptz, coalesce(x->>'status', 'upcoming')
  from jsonb_array_elements(p_rows) x
  on conflict (comp, round_no) do update set
    label = excluded.label,
    deadline_at = case when r.locked_at is null then excluded.deadline_at else r.deadline_at end,
    first_kickoff = case when r.locked_at is null then excluded.first_kickoff else r.first_kickoff end,
    status = excluded.status;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.f_fixtures_upsert(p_comp text, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.fantasy_fixtures as f (comp, fixture_id, round_no, kickoff, status, home_id, away_id, home_name, away_name, home_goals, away_goals, updated_at)
  select p_comp, (x->>'fixture_id')::int, (x->>'round_no')::int, (x->>'kickoff')::timestamptz, x->>'status', (x->>'home_id')::int, (x->>'away_id')::int,
         x->>'home_name', x->>'away_name', (x->>'home_goals')::int, (x->>'away_goals')::int, now()
  from jsonb_array_elements(p_rows) x
  on conflict (comp, fixture_id) do update set
    round_no = excluded.round_no, kickoff = excluded.kickoff, status = excluded.status, home_name = excluded.home_name, away_name = excluded.away_name,
    home_goals = excluded.home_goals, away_goals = excluded.away_goals, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

-- Ottelun pelaajatilastot korvataan kokonaan (lähteen korjaus → uusi tila; sama data uudelleen → sama tulos, ei tuplia)
create or replace function public.f_stats_replace(p_comp text, p_fixture integer, p_rows jsonb, p_consistent boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.fantasy_player_stats where comp = p_comp and fixture_id = p_fixture;
  insert into public.fantasy_player_stats (comp, fixture_id, player_id, team_id, minutes, goals, assists, saves, yellow, red, conceded)
  select p_comp, p_fixture, (x->>'player_id')::int, (x->>'team_id')::int, (x->>'minutes')::int, (x->>'goals')::int, (x->>'assists')::int,
         (x->>'saves')::int, (x->>'yellow')::int, (x->>'red')::int, (x->>'conceded')::int
  from jsonb_array_elements(p_rows) x;
  update public.fantasy_fixtures set consistent = p_consistent, stats_at = now() where comp = p_comp and fixture_id = p_fixture;
  return jsonb_build_object('rows', jsonb_array_length(p_rows));
end $$;

-- Lukitus: kierrokset, joiden määräaika on mennyt → muuttumaton tilannekuva jokaisesta joukkueesta, joka ehti mukaan.
-- Tilannekuva = uusin valintarivi, jonka from_round <= kierros (määräajan jälkeen tallennukset kohdistuvat seuraavaan kierrokseen).
create or replace function public.f_lock_due(p_comp text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_round record; v_locked int[] := '{}';
begin
  for v_round in select round_no from public.fantasy_rounds where comp = p_comp and locked_at is null and deadline_at <= now() order by round_no for update loop
    insert into public.fantasy_gw_picks (team_id, round_no, picks, hits)
    select t.id, v_round.round_no, p.picks, coalesce(tr.cost, 0)
    from public.fantasy_teams t
    join lateral (select picks from public.fantasy_picks where team_id = t.id and from_round <= v_round.round_no order by from_round desc limit 1) p on true
    left join public.fantasy_round_transfers tr on tr.team_id = t.id and tr.round_no = v_round.round_no
    where t.comp = p_comp and t.first_round is not null and t.first_round <= v_round.round_no
    on conflict (team_id, round_no) do nothing;
    update public.fantasy_rounds set locked_at = now() where comp = p_comp and round_no = v_round.round_no;
    v_locked := v_locked || v_round.round_no;
  end loop;
  return jsonb_build_object('locked', to_jsonb(v_locked));
end $$;

-- Pisteytyksen syötteet kierrokselle: tilannekuvat, kierroksen ottelut ja pelaajatilastot
create or replace function public.f_round_inputs(p_comp text, p_round integer) returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'snapshots', coalesce((select jsonb_agg(jsonb_build_object('team_id', g.team_id, 'picks', g.picks, 'hits', g.hits))
                  from public.fantasy_gw_picks g join public.fantasy_teams t on t.id = g.team_id where t.comp = p_comp and g.round_no = p_round), '[]'::jsonb),
    'fixtures', coalesce((select jsonb_agg(jsonb_build_object('fixture_id', fixture_id, 'status', status, 'home_id', home_id, 'away_id', away_id,
                  'home_goals', home_goals, 'away_goals', away_goals, 'consistent', consistent, 'stats_at', stats_at))
                  from public.fantasy_fixtures where comp = p_comp and round_no = p_round), '[]'::jsonb),
    'stats', coalesce((select jsonb_agg(jsonb_build_object('fixture_id', s.fixture_id, 'player_id', s.player_id, 'team_id', s.team_id, 'minutes', s.minutes,
                  'goals', s.goals, 'assists', s.assists, 'saves', s.saves, 'yellow', s.yellow, 'red', s.red, 'conceded', s.conceded))
                  from public.fantasy_player_stats s join public.fantasy_fixtures f on f.comp = s.comp and f.fixture_id = s.fixture_id
                  where s.comp = p_comp and f.round_no = p_round), '[]'::jsonb),
    'positions', coalesce((select jsonb_object_agg(player_id::text, position) from public.fantasy_players where comp = p_comp), '{}'::jsonb))
$$;

-- Kierroksen pisteet korvataan (uudelleenlaskenta on idempotentti)
create or replace function public.f_points_store(p_comp text, p_round integer, p_rows jsonb, p_status text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.fantasy_round_points as r (team_id, round_no, points, hits, total, breakdown, provisional, computed_at)
  select (x->>'team_id')::bigint, p_round, (x->>'points')::int, (x->>'hits')::int, (x->>'total')::int, x->'breakdown', (x->>'provisional')::boolean, now()
  from jsonb_array_elements(p_rows) x
  where exists (select 1 from public.fantasy_teams t where t.id = (x->>'team_id')::bigint and t.comp = p_comp)
  on conflict (team_id, round_no) do update set points = excluded.points, hits = excluded.hits, total = excluded.total,
    breakdown = excluded.breakdown, provisional = excluded.provisional, computed_at = now();
  update public.fantasy_rounds set status = p_status where comp = p_comp and round_no = p_round;
  return jsonb_build_object('rows', jsonb_array_length(p_rows));
end $$;

-- Pelinäkymän perustiedot: kilpailu, kierrokset (määräajat palvelimen kellolla), oma joukkue historioineen
create or replace function public.f_state(p_comp text, p_user bigint) returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'now', now(),
    'comp', (select jsonb_build_object('id', id, 'name', name, 'season', season, 'budget', budget, 'sync_ok_at', sync_ok_at, 'sync_error', sync_error, 'sync_error_at', sync_error_at)
             from public.fantasy_comps where id = p_comp),
    'rounds', coalesce((select jsonb_agg(jsonb_build_object('round_no', round_no, 'label', label, 'deadline_at', deadline_at, 'first_kickoff', first_kickoff,
               'locked', locked_at is not null, 'status', status) order by round_no) from public.fantasy_rounds where comp = p_comp), '[]'::jsonb),
    'team', (select jsonb_build_object('id', t.id, 'name', t.name, 'first_round', t.first_round, 'version', t.version,
               'picks', coalesce((select jsonb_agg(jsonb_build_object('from_round', from_round, 'picks', picks) order by from_round) from public.fantasy_picks where team_id = t.id), '[]'::jsonb),
               'snapshots', coalesce((select jsonb_agg(jsonb_build_object('round_no', round_no, 'picks', picks, 'hits', hits) order by round_no) from public.fantasy_gw_picks where team_id = t.id), '[]'::jsonb),
               'transfers', coalesce((select jsonb_agg(jsonb_build_object('round_no', round_no, 'transfers', transfers, 'cost', cost) order by round_no) from public.fantasy_round_transfers where team_id = t.id), '[]'::jsonb),
               'points', coalesce((select jsonb_agg(jsonb_build_object('round_no', round_no, 'points', points, 'hits', hits, 'total', total, 'provisional', provisional, 'breakdown', breakdown) order by round_no) from public.fantasy_round_points where team_id = t.id), '[]'::jsonb))
             from public.fantasy_teams t where t.comp = p_comp and t.user_id = p_user))
$$;

-- Pelaajalista hintoineen ja kauden fantasy-pisteineen (pisteet kaikkien tallennettujen pelaajarivien perusteella)
create or replace function public.f_players(p_comp text) returns jsonb
language sql security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.player_id, 'name', p.name, 'team_id', p.team_id, 'team', p.team_name, 'logo', p.team_logo,
           'pos', p.position, 'price', p.price, 'active', p.active, 'photo', p.photo) order by p.price desc, p.name), '[]'::jsonb)
  from public.fantasy_players p where p.comp = p_comp
$$;

create or replace function public.f_team_create(p_comp text, p_user bigint, p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  insert into public.fantasy_teams (comp, user_id, name) values (p_comp, p_user, p_name) returning id into v_id;
  return jsonb_build_object('id', v_id);
exception when unique_violation then return jsonb_build_object('error', 'exists');
end $$;

create or replace function public.f_team_rename(p_team bigint, p_user bigint, p_name text) returns jsonb
language sql security definer set search_path = '' as $$
  update public.fantasy_teams set name = p_name where id = p_team and user_id = p_user returning jsonb_build_object('ok', true)
$$;

-- Valintojen tallennus kierrokselle p_round. Tarkistukset: omistaja, kierros on seuraava avoin (määräaika tietokannan kellolla),
-- versio (estää kaksoisvahvistuksen ja ristiriitaiset samanaikaiset muutokset). Siirtomäärä ja pistevähennys lasketaan
-- palvelimella valintojen perusteella ja kirjataan kierrokselle (sama tila uudelleen → sama kirjaus).
create or replace function public.f_picks_save(p_team bigint, p_user bigint, p_round integer, p_expected_version integer, p_picks jsonb, p_transfers integer, p_cost integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_team record; v_next int;
begin
  select * into v_team from public.fantasy_teams where id = p_team and user_id = p_user for update;
  if not found then return jsonb_build_object('error', 'forbidden'); end if;
  if v_team.version <> p_expected_version then return jsonb_build_object('error', 'conflict', 'version', v_team.version); end if;
  select min(round_no) into v_next from public.fantasy_rounds where comp = v_team.comp and locked_at is null and deadline_at > now();
  if v_next is null or v_next <> p_round then return jsonb_build_object('error', 'deadline', 'next', v_next); end if;
  insert into public.fantasy_picks (team_id, from_round, picks, saved_at) values (p_team, p_round, p_picks, now())
  on conflict (team_id, from_round) do update set picks = excluded.picks, saved_at = now();
  if v_team.first_round is null or v_team.first_round > p_round then
    update public.fantasy_teams set first_round = p_round where id = p_team;
  end if;
  insert into public.fantasy_round_transfers (team_id, round_no, transfers, cost) values (p_team, p_round, p_transfers, p_cost)
  on conflict (team_id, round_no) do update set transfers = excluded.transfers, cost = excluded.cost;
  update public.fantasy_teams set version = version + 1 where id = p_team;
  return jsonb_build_object('ok', true, 'version', v_team.version + 1);
end $$;

-- Ranking: kokonaispisteet (kauden kaikki kierrokset) ja valitun kierroksen pisteet. Tasapisteet: sama sija (1, 2, 2, 4);
-- näyttöjärjestys tasapisteissä: aiemmin luotu joukkue ensin. p_league null = kaikki joukkueet.
create or replace function public.f_ranking(p_comp text, p_league bigint, p_round integer, p_limit integer, p_offset integer, p_team bigint) returns jsonb
language sql security definer set search_path = '' as $$
  with base as (
    select t.id, t.name, t.created_at,
      coalesce((select sum(total) from public.fantasy_round_points r where r.team_id = t.id), 0) as total,
      coalesce((select total from public.fantasy_round_points r where r.team_id = t.id and r.round_no = p_round), 0) as round_pts
    from public.fantasy_teams t
    where t.comp = p_comp and t.first_round is not null
      and (p_league is null or exists (select 1 from public.fantasy_league_members m where m.league_id = p_league and m.team_id = t.id))
  ), ranked as (
    select *, rank() over (order by total desc) as rnk, row_number() over (order by total desc, created_at, id) as ord from base
  )
  select jsonb_build_object(
    'count', (select count(*) from ranked),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('rank', rnk, 'team_id', id, 'name', name, 'round', round_pts, 'total', total) order by ord)
              from (select * from ranked order by ord limit greatest(1, least(p_limit, 100)) offset greatest(0, p_offset)) x), '[]'::jsonb),
    'me', (select jsonb_build_object('rank', rnk, 'team_id', id, 'name', name, 'round', round_pts, 'total', total, 'ord', ord) from ranked where id = p_team))
$$;

-- Liigat
create or replace function public.f_league_create(p_team bigint, p_user bigint, p_name text, p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_t record; v_id bigint;
begin
  select * into v_t from public.fantasy_teams where id = p_team and user_id = p_user;
  if not found then return jsonb_build_object('error', 'forbidden'); end if;
  if (select count(*) from public.fantasy_leagues where owner_team = p_team) >= 20 then return jsonb_build_object('error', 'limit'); end if;
  insert into public.fantasy_leagues (comp, name, owner_team, code) values (v_t.comp, p_name, p_team, p_code) returning id into v_id;
  insert into public.fantasy_league_members (league_id, team_id) values (v_id, p_team);
  return jsonb_build_object('id', v_id, 'code', p_code);
exception when unique_violation then return jsonb_build_object('error', 'code');
end $$;

create or replace function public.f_league_join(p_team bigint, p_user bigint, p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_t record; v_l record;
begin
  select * into v_t from public.fantasy_teams where id = p_team and user_id = p_user;
  if not found then return jsonb_build_object('error', 'forbidden'); end if;
  select * into v_l from public.fantasy_leagues where code = upper(p_code) and comp = v_t.comp;
  if not found then return jsonb_build_object('error', 'notfound'); end if;
  if (select count(*) from public.fantasy_league_members where league_id = v_l.id) >= 500 then return jsonb_build_object('error', 'full'); end if;
  insert into public.fantasy_league_members (league_id, team_id) values (v_l.id, p_team) on conflict do nothing;
  return jsonb_build_object('id', v_l.id, 'name', v_l.name);
end $$;

create or replace function public.f_league_leave(p_team bigint, p_user bigint, p_league bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_l record;
begin
  if not exists (select 1 from public.fantasy_teams where id = p_team and user_id = p_user) then return jsonb_build_object('error', 'forbidden'); end if;
  select * into v_l from public.fantasy_leagues where id = p_league;
  if not found then return jsonb_build_object('error', 'notfound'); end if;
  delete from public.fantasy_league_members where league_id = p_league and team_id = p_team;
  -- perustajan poistuessa liiga siirtyy pisimpään mukana olleelle jäsenelle; tyhjä liiga poistetaan
  if v_l.owner_team = p_team then
    update public.fantasy_leagues set owner_team = (select team_id from public.fantasy_league_members where league_id = p_league order by joined_at limit 1)
    where id = p_league and exists (select 1 from public.fantasy_league_members where league_id = p_league);
    delete from public.fantasy_leagues where id = p_league and not exists (select 1 from public.fantasy_league_members where league_id = p_league);
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.f_league_rotate(p_team bigint, p_user bigint, p_league bigint, p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.fantasy_teams where id = p_team and user_id = p_user) then return jsonb_build_object('error', 'forbidden'); end if;
  update public.fantasy_leagues set code = p_code where id = p_league and owner_team = p_team;
  if not found then return jsonb_build_object('error', 'forbidden'); end if;
  return jsonb_build_object('code', p_code);
exception when unique_violation then return jsonb_build_object('error', 'code');
end $$;

create or replace function public.f_leagues_of(p_team bigint, p_user bigint) returns jsonb
language sql security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'owner', l.owner_team = p_team,
           'members', (select count(*) from public.fantasy_league_members x where x.league_id = l.id)) order by l.name), '[]'::jsonb)
  from public.fantasy_leagues l join public.fantasy_league_members m on m.league_id = l.id
  join public.fantasy_teams t on t.id = m.team_id
  where m.team_id = p_team and t.user_id = p_user
$$;

-- Liigan tiedot vain jäsenelle; liittymiskoodi vain jäsenille (jäsen voi kutsua kavereita)
create or replace function public.f_league_get(p_team bigint, p_user bigint, p_league bigint) returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object('id', l.id, 'name', l.name, 'code', l.code, 'owner', l.owner_team = p_team, 'created_at', l.created_at)
  from public.fantasy_leagues l
  where l.id = p_league
    and exists (select 1 from public.fantasy_league_members m join public.fantasy_teams t on t.id = m.team_id
                where m.league_id = l.id and m.team_id = p_team and t.user_id = p_user)
$$;

-- Ylläpidon tila
create or replace function public.f_status(p_comp text) returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'comp', (select to_jsonb(c) from public.fantasy_comps c where id = p_comp),
    'players', (select count(*) from public.fantasy_players where comp = p_comp and active),
    'admin_prices', (select count(*) from public.fantasy_players where comp = p_comp and price_source = 'admin'),
    'teams', (select count(*) from public.fantasy_teams where comp = p_comp),
    'rounds', coalesce((select jsonb_agg(jsonb_build_object('round_no', r.round_no, 'deadline_at', r.deadline_at, 'locked', r.locked_at is not null, 'status', r.status,
       'fixtures', (select count(*) from public.fantasy_fixtures f where f.comp = p_comp and f.round_no = r.round_no),
       'with_stats', (select count(*) from public.fantasy_fixtures f where f.comp = p_comp and f.round_no = r.round_no and f.stats_at is not null),
       'inconsistent', (select count(*) from public.fantasy_fixtures f where f.comp = p_comp and f.round_no = r.round_no and f.consistent = false)) order by r.round_no)
       from public.fantasy_rounds r where r.comp = p_comp), '[]'::jsonb))
$$;

do $$ declare f text; begin
  foreach f in array array[
    'f_user_create(text,text)','f_user_by_name(text)','f_session_create(text,bigint,integer)','f_session_get(text)','f_session_delete(text)',
    'f_throttle(text,integer,integer)','f_comp_ensure(text,text,integer,integer)','f_sync_claim(text,integer,integer)','f_sync_done(text,boolean,text)',
    'f_players_upsert(text,jsonb,boolean)','f_price_set(text,integer,numeric)','f_rounds_upsert(text,jsonb)','f_fixtures_upsert(text,jsonb)',
    'f_stats_replace(text,integer,jsonb,boolean)','f_lock_due(text)','f_round_inputs(text,integer)','f_points_store(text,integer,jsonb,text)',
    'f_state(text,bigint)','f_players(text)','f_team_create(text,bigint,text)','f_team_rename(bigint,bigint,text)',
    'f_picks_save(bigint,bigint,integer,integer,jsonb,integer,integer)','f_ranking(text,bigint,integer,integer,integer,bigint)',
    'f_league_create(bigint,bigint,text,text)','f_league_join(bigint,bigint,text)','f_league_leave(bigint,bigint,bigint)',
    'f_league_rotate(bigint,bigint,bigint,text)','f_leagues_of(bigint,bigint)','f_league_get(bigint,bigint,bigint)','f_status(text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- Poisto: drop function public.f_… (yllä luetellut); drop table public.fantasy_league_members, public.fantasy_leagues,
-- public.fantasy_round_points, public.fantasy_gw_picks, public.fantasy_round_transfers, public.fantasy_picks, public.fantasy_teams,
-- public.fantasy_player_stats, public.fantasy_fixtures, public.fantasy_rounds, public.fantasy_players, public.fantasy_comps,
-- public.fantasy_throttle, public.fantasy_sessions, public.fantasy_users;
