-- Futista Fantasy: luotettavuus. Aja 20261106_fantasy_tasks.sql:n jälkeen. Idempotentti. EI POISTA mitään.
--
-- 1) Piilotetut kierrokset: pelistä poistettujen sarjojen (Veikkausliiga/MLS 29.–30.10.2026) jäljiltä tietokantaan jääneet
--    kierrokset, joilla ei ole nykyisten sarjojen otteluita eikä yhdenkään joukkueen tietoja, merkitään piilotetuiksi
--    (fantasy_rounds.hidden). Kierroksia, otteluita, tilastoja tai palkintoja ei poisteta. Kierros, jolla on joukkueen
--    tilannekuva, pisteet, siirrot, valinnat tai tehtäviä, ei piilotu koskaan.
--    Palautus: update public.fantasy_rounds set hidden = false;  (ja tarvittaessa alter table ... drop column hidden)
-- 2) Lukitus tietokannassa ilman sivukäyntiä: f_lock_all() lukitsee kaikkien kilpailujen erääntyneet kierrokset
--    (sama f_lock_due kuin ennen). Ajastus alla (pg_cron, kerran minuutissa) – ei verkkokutsua eikä salaisuutta.
-- 3) Datan päivitys ilman sivukäyntiä: pg_cron + pg_net kutsuu ylläpitorajapintaa 10 min välein (sama malli ja sama
--    Vaultin salaisuus futista_cron_secret kuin kohokohdissa). Ilman salaisuutta kutsu saa 401:n, mutta lukitus toimii silti.

alter table public.fantasy_rounds add column if not exists hidden boolean not null default false;

-- Näkyvyys päivityksessä: p_keep = kierrokset, joilla on nykyisten sarjojen otteluita. Muut kierrokset piilotetaan vain,
-- jos ne ovat jo lukittuja ja niihin ei liity mitään joukkuetietoa. (Lukitsemattomat kierrokset ilman otteluita poistaa jo
-- f_rounds_upsert; lukitsematonta kierrosta ei piiloteta, jotta tallennuksen "seuraava avoin kierros" pysyy samana
-- tietokannassa ja sovelluksessa.) Palauttaa piilotetut ja näkyviksi palautetut kierrosnumerot.
create or replace function public.f_rounds_visibility(p_comp text, p_keep jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_keep integer[]; v_hidden int[]; v_shown int[];
begin
  if p_keep is null or jsonb_typeof(p_keep) <> 'array' or jsonb_array_length(p_keep) = 0 then return jsonb_build_object('error', 'empty'); end if;
  v_keep := array(select (x)::int from jsonb_array_elements_text(p_keep) x);
  with u as (
    update public.fantasy_rounds r set hidden = false
    where r.comp = p_comp and r.hidden and r.round_no = any (v_keep)
    returning r.round_no
  ) select coalesce(array_agg(round_no order by round_no), '{}') into v_shown from u;
  with u as (
    update public.fantasy_rounds r set hidden = true
    where r.comp = p_comp and not r.hidden and not (r.round_no = any (v_keep)) and r.locked_at is not null
      and not exists (select 1 from public.fantasy_gw_picks g join public.fantasy_teams t on t.id = g.team_id where t.comp = p_comp and g.round_no = r.round_no)
      and not exists (select 1 from public.fantasy_round_points p join public.fantasy_teams t on t.id = p.team_id where t.comp = p_comp and p.round_no = r.round_no)
      and not exists (select 1 from public.fantasy_round_transfers x join public.fantasy_teams t on t.id = x.team_id where t.comp = p_comp and x.round_no = r.round_no)
      and not exists (select 1 from public.fantasy_picks k join public.fantasy_teams t on t.id = k.team_id where t.comp = p_comp and k.from_round = r.round_no)
      and not exists (select 1 from public.fantasy_teams t where t.comp = p_comp and t.first_round = r.round_no)
      and not exists (select 1 from public.fantasy_round_rewards w where w.comp = p_comp and w.round_no = r.round_no)
      and (to_regclass('public.fantasy_round_tasks') is null
           or not exists (select 1 from public.fantasy_round_tasks k where k.comp = p_comp and k.round_no = r.round_no))
    returning r.round_no
  ) select coalesce(array_agg(round_no order by round_no), '{}') into v_hidden from u;
  return jsonb_build_object('hidden', to_jsonb(v_hidden), 'shown', to_jsonb(v_shown));
end $$;

-- Pelinäkymän perustiedot: kuten ennen + kierroksen hidden-tieto (sovellus suodattaa piilotetut näkymistä)
create or replace function public.f_state(p_comp text, p_user bigint) returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'now', now(),
    'comp', (select jsonb_build_object('id', id, 'name', name, 'season', season, 'budget', budget, 'sync_ok_at', sync_ok_at, 'sync_error', sync_error, 'sync_error_at', sync_error_at)
             from public.fantasy_comps where id = p_comp),
    'rounds', coalesce((select jsonb_agg(jsonb_build_object('round_no', round_no, 'label', label, 'deadline_at', deadline_at, 'first_kickoff', first_kickoff,
               'locked', locked_at is not null, 'status', status, 'hidden', hidden) order by round_no) from public.fantasy_rounds where comp = p_comp), '[]'::jsonb),
    'team', (select jsonb_build_object('id', t.id, 'name', t.name, 'first_round', t.first_round, 'version', t.version,
               'picks', coalesce((select jsonb_agg(jsonb_build_object('from_round', from_round, 'picks', picks) order by from_round) from public.fantasy_picks where team_id = t.id), '[]'::jsonb),
               'snapshots', coalesce((select jsonb_agg(jsonb_build_object('round_no', round_no, 'picks', picks, 'hits', hits) order by round_no) from public.fantasy_gw_picks where team_id = t.id), '[]'::jsonb),
               'transfers', coalesce((select jsonb_agg(jsonb_build_object('round_no', round_no, 'transfers', transfers, 'cost', cost) order by round_no) from public.fantasy_round_transfers where team_id = t.id), '[]'::jsonb),
               'points', coalesce((select jsonb_agg(jsonb_build_object('round_no', round_no, 'points', points, 'hits', hits, 'total', total, 'provisional', provisional, 'breakdown', breakdown) order by round_no) from public.fantasy_round_points where team_id = t.id), '[]'::jsonb))
             from public.fantasy_teams t where t.comp = p_comp and t.user_id = p_user))
$$;

-- Kaikkien kilpailujen erääntyneiden kierrosten lukitus (ajastus kerran minuutissa). Idempotentti: f_lock_due lukitsee vain
-- lukitsemattomat kierrokset, joiden määräaika on mennyt, ja tilannekuva on "on conflict do nothing".
-- Tilannekuva = uusin valinta, jonka from_round <= kierros. Tallennus (f_picks_save) hyväksyy kierrokselle vain ennen
-- määräaikaa (tietokannan kello), joten myöhässä tehty lukitus tuottaa saman tilannekuvan kuin ajallaan tehty.
create or replace function public.f_lock_all() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_c text; v_out jsonb := '{}'::jsonb; v_r jsonb;
begin
  for v_c in select distinct comp from public.fantasy_rounds where locked_at is null and deadline_at <= now() loop
    v_r := public.f_lock_due(v_c);
    v_out := v_out || jsonb_build_object(v_c, v_r->'locked');
  end loop;
  return v_out;
end $$;

revoke all on function public.f_rounds_visibility(text, jsonb) from public, anon, authenticated;
revoke all on function public.f_state(text, bigint) from public, anon, authenticated;
revoke all on function public.f_lock_all() from public, anon, authenticated;
grant execute on function public.f_rounds_visibility(text, jsonb) to service_role;
grant execute on function public.f_state(text, bigint) to service_role;
grant execute on function public.f_lock_all() to service_role;

-- AJASTUS (Supabase pg_cron + pg_net; paikallinen testi ajaa vain yllä olevan osan)
-- Lukitus: kerran minuutissa tietokannassa (ei riipu sivukäynnistä, palvelimesta eikä verkkokutsusta).
-- Päivitys: 10 min välein ylläpitorajapintaan {"action":"tick"} (sama 5 min lukko ja virhetauko kuin sivukäynnin
-- käynnistämällä päivityksellä; ei pakota hakua, joten kiintiön kulutus ei kasva sivukäyntejä suuremmaksi).
-- Tarkistus: select jobname, schedule, active from cron.job where jobname like 'futista-fantasy%';
--            select * from cron.job_run_details where jobid in (select jobid from cron.job where jobname like 'futista-fantasy%') order by start_time desc limit 20;
-- Poisto:    select cron.unschedule(jobid) from cron.job where jobname like 'futista-fantasy%';
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname in ('futista-fantasy-lukitus', 'futista-fantasy-paivitys');

select cron.schedule('futista-fantasy-lukitus', '* * * * *', $$ select public.f_lock_all(); $$);

select cron.schedule(
  'futista-fantasy-paivitys',
  '3,13,23,33,43,53 * * * *',
  $$
  select net.http_post(
    url := 'https://www.futista.fi/api/fantasy/yllapito',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'futista_cron_secret'),
                                  'Content-Type', 'application/json'),
    body := '{"action":"tick"}'::jsonb,
    timeout_milliseconds := 58000
  );
  $$
);
