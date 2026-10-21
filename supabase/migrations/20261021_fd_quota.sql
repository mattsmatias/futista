-- Futista: football-data.orgin YHTEINEN hakukiintiö kaikille palvelininstansseille (tuotanto + esikatselu).
-- Aja kerran: Supabase → SQL Editor → tämä tiedosto. Lisää vain uusia tauluja ja funktioita; ei muuta olemassa olevia.
--
-- Toiminta
--  * Liukuva ikkuna (sovellus antaa 61 s = 60 s + 1 s varmuus varauksen ja lähteeseen saapumisen väliselle
--    viiveelle): jokainen onnistunut varaus on rivi fd_quota_calls-taulussa.
--  * Varaus on atominen: pg_advisory_xact_lock sarjoittaa saman ämpärin varaukset, joten rinnakkaiset
--    pyynnöt eivät voi ylittää rajaa. Aika otetaan tietokannan kellosta (sama kaikille instansseille).
--  * fd_quota_block: 429 / Retry-After tai 401/403 pysäyttää KAIKKI instanssit yhteisesti.
--  * Ämpäri (bucket) = avaimen tiiviste, joten sama avain tuotannossa ja esikatselussa jakaa saman kiintiön.
--  * Taulut ja funktiot vain palvelimen secret / service_role -avaimelle (RLS päällä, ei käytäntöjä anonille).
--  * SECURITY DEFINER -funktioissa tyhjä search_path ja täysin nimetyt objektit (ei hakupolkukaappausta).
--  * Taulu ei kasva rajatta: jokainen varaus poistaa oman ämpärinsä vanhentuneet rivit ja kaikkien
--    ämpärien yli tunnin vanhat rivit (myös vaihdettujen avainten vanhat ämpärit).
--  * Yhteensopivuus: testattu PostgreSQL 15, 16 ja 17 (Supabasen hostatut versiot 15 ja 17).
--  * Turvallinen ottaa käyttöön vanhan tuotantoversion rinnalla: vain uusia objekteja, ei muutoksia
--    olemassa oleviin tauluihin; ajettavissa uudelleen (idempotentti).
--  * Poisto (tarvittaessa): drop function public.fd_quota_acquire(text, int, int, boolean, int);
--    drop function public.fd_quota_block(text, bigint, text); drop table public.fd_quota_calls, public.fd_quota_state;

create table if not exists public.fd_quota_calls (
  id     bigserial primary key,
  bucket text        not null,
  at     timestamptz not null default clock_timestamp(),
  low    boolean     not null default false
);
create index if not exists fd_quota_calls_bucket_at on public.fd_quota_calls (bucket, at);
create index if not exists fd_quota_calls_at on public.fd_quota_calls (at);

create table if not exists public.fd_quota_state (
  bucket        text primary key,
  blocked_until timestamptz,
  reason        text,
  updated_at    timestamptz not null default now()
);

alter table public.fd_quota_calls enable row level security;
alter table public.fd_quota_state enable row level security;
revoke all on public.fd_quota_calls from anon, authenticated;
revoke all on public.fd_quota_state from anon, authenticated;
revoke all on sequence public.fd_quota_calls_id_seq from anon, authenticated;

-- Varaa yksi haku. Palauttaa {"ok":true,"used":n} tai {"ok":false,"reason":"limit"|"paused","wait_ms":n}
create or replace function public.fd_quota_acquire(
  p_bucket text, p_limit int, p_low_limit int, p_low boolean, p_window_ms int default 60000
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now     timestamptz;
  v_window  interval := make_interval(secs => p_window_ms / 1000.0);
  v_blocked timestamptz;
  v_count   int;
  v_low     int;
  v_oldest  timestamptz;
begin
  if p_bucket is null or length(p_bucket) > 64 or p_limit < 1 or p_limit > 1000
     or p_low_limit < 0 or p_window_ms < 1000 or p_window_ms > 3600000 then
    raise exception 'invalid quota arguments';
  end if;
  perform pg_advisory_xact_lock(hashtext('fd_quota:' || p_bucket));
  -- aika luetaan vasta lukon saamisen jälkeen: lukon odotus ei saa siirtää kirjattua hetkeä menneisyyteen
  v_now := clock_timestamp();

  select blocked_until into v_blocked from public.fd_quota_state where bucket = p_bucket;
  if v_blocked is not null and v_blocked > v_now then
    return jsonb_build_object('ok', false, 'reason', 'paused',
      'wait_ms', ceil(extract(epoch from (v_blocked - v_now)) * 1000));
  end if;

  delete from public.fd_quota_calls where bucket = p_bucket and at <= v_now - v_window;
  -- siivous: kaikkien ämpärien yli tunnin vanhat rivit (ikkuna on enintään 1 h)
  delete from public.fd_quota_calls where at < v_now - interval '1 hour';
  select count(*), count(*) filter (where low), min(at)
    into v_count, v_low, v_oldest
    from public.fd_quota_calls where bucket = p_bucket;

  if v_count >= p_limit or (p_low and v_low >= p_low_limit) then
    return jsonb_build_object('ok', false, 'reason', 'limit',
      'wait_ms', greatest(0, ceil(extract(epoch from (v_oldest + v_window - v_now)) * 1000)));
  end if;

  insert into public.fd_quota_calls (bucket, at, low) values (p_bucket, v_now, p_low);
  return jsonb_build_object('ok', true, 'used', v_count + 1);
end;
$$;

-- Yhteinen tauko (esim. 429 + Retry-After). Ei koskaan lyhennä voimassa olevaa taukoa.
create or replace function public.fd_quota_block(p_bucket text, p_until_ms bigint, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_bucket is null or length(p_bucket) > 64 then
    raise exception 'invalid quota arguments';
  end if;
  -- tauko enintään 24 h eteenpäin; vanhat päättyneet tauot siivotaan
  delete from public.fd_quota_state where blocked_until < now() - interval '1 day';
  insert into public.fd_quota_state (bucket, blocked_until, reason, updated_at)
  values (p_bucket, least(to_timestamp(p_until_ms / 1000.0), now() + interval '24 hours'), left(p_reason, 200), now())
  on conflict (bucket) do update
    set blocked_until = greatest(public.fd_quota_state.blocked_until, excluded.blocked_until),
        reason = excluded.reason,
        updated_at = now();
end;
$$;

revoke execute on function public.fd_quota_acquire(text, int, int, boolean, int) from public, anon, authenticated;
revoke execute on function public.fd_quota_block(text, bigint, text) from public, anon, authenticated;
grant execute on function public.fd_quota_acquire(text, int, int, boolean, int) to service_role;
grant execute on function public.fd_quota_block(text, bigint, text) to service_role;
