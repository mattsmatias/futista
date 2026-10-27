-- Futista Fantasy: useamman sarjan peli (Valioliiga, La Liga, Bundesliga, Serie A, Ligue 1) viikkokierroksin.
-- Aja 20261027_fantasy.sql:n (ja 20261027b_fantasy_logo.sql:n) jälkeen. Idempotentti; ei poista dataa.
--  - Pelaajalle sarja (fantasy_players.league) → sarjasuodatin ja sarjan nimi pelaajakortissa.
--  - Ottelun kierros jäätyy, kun kierros on lukittu (siirretty ottelu pisteytetään alkuperäisellä tilannekuvalla).
--  - Lukitsemattomat kierrokset, joille ei enää ole otteluita (kaikki siirretty muille viikoille), poistetaan.

alter table public.fantasy_players add column if not exists league integer;

create or replace function public.f_players_upsert(p_comp text, p_rows jsonb, p_full boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  insert into public.fantasy_players as p (comp, player_id, name, team_id, team_name, team_logo, position, price, photo, league, active, updated_at)
  select p_comp, (r->>'player_id')::int, r->>'name', (r->>'team_id')::int, r->>'team_name', r->>'team_logo', r->>'position',
         (r->>'price')::numeric, r->>'photo', (r->>'league')::int, true, now()
  from jsonb_array_elements(p_rows) r
  on conflict (comp, player_id) do update set
    name = excluded.name, team_id = excluded.team_id, team_name = excluded.team_name, team_logo = excluded.team_logo,
    position = excluded.position, photo = excluded.photo, league = coalesce(excluded.league, p.league), active = true, updated_at = now();
  get diagnostics v_n = row_count;
  update public.fantasy_comps set players_at = now() where id = p_comp;
  if p_full then
    update public.fantasy_players set active = false, updated_at = now()
    where comp = p_comp and active and player_id not in (select (r->>'player_id')::int from jsonb_array_elements(p_rows) r);
  end if;
  return jsonb_build_object('upserted', v_n);
end $$;

create or replace function public.f_players(p_comp text) returns jsonb
language sql security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.player_id, 'name', p.name, 'team_id', p.team_id, 'team', p.team_name, 'logo', p.team_logo,
           'pos', p.position, 'price', p.price, 'active', p.active, 'photo', p.photo, 'league', p.league) order by p.price desc, p.name), '[]'::jsonb)
  from public.fantasy_players p where p.comp = p_comp
$$;

-- Ottelut: lukitun kierroksen ottelu pysyy kierroksessaan, vaikka sen ajankohta muuttuisi
create or replace function public.f_fixtures_upsert(p_comp text, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.fantasy_fixtures as f (comp, fixture_id, round_no, kickoff, status, home_id, away_id, home_name, away_name, home_goals, away_goals, updated_at)
  select p_comp, (x->>'fixture_id')::int, (x->>'round_no')::int, (x->>'kickoff')::timestamptz, x->>'status', (x->>'home_id')::int, (x->>'away_id')::int,
         x->>'home_name', x->>'away_name', (x->>'home_goals')::int, (x->>'away_goals')::int, now()
  from jsonb_array_elements(p_rows) x
  on conflict (comp, fixture_id) do update set
    round_no = case when exists (select 1 from public.fantasy_rounds r where r.comp = f.comp and r.round_no = f.round_no and r.locked_at is not null)
                    then f.round_no else excluded.round_no end,
    kickoff = excluded.kickoff, status = excluded.status, home_name = excluded.home_name, away_name = excluded.away_name,
    home_goals = excluded.home_goals, away_goals = excluded.away_goals, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

-- Kierrokset: kuten ennen (lukitun määräaika ei muutu) + lukitsemattomat kierrokset ilman otteluita poistetaan
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
  delete from public.fantasy_rounds r
  where r.comp = p_comp and r.locked_at is null
    and r.round_no not in (select (x->>'round_no')::int from jsonb_array_elements(p_rows) x)
    and not exists (select 1 from public.fantasy_fixtures f where f.comp = p_comp and f.round_no = r.round_no);
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.f_players_upsert(text, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.f_players(text) from public, anon, authenticated;
revoke all on function public.f_fixtures_upsert(text, jsonb) from public, anon, authenticated;
revoke all on function public.f_rounds_upsert(text, jsonb) from public, anon, authenticated;
grant execute on function public.f_players_upsert(text, jsonb, boolean) to service_role;
grant execute on function public.f_players(text) to service_role;
grant execute on function public.f_fixtures_upsert(text, jsonb) to service_role;
grant execute on function public.f_rounds_upsert(text, jsonb) to service_role;
