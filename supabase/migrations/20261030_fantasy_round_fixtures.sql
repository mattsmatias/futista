-- Futista Fantasy: seuraavan (lukitsemattoman) kierroksen ottelut joukkueittain pelaaja- ja siirtonäkymiä varten
-- ("kierroksella 2 ottelua"). Vain luku; ei muuta tauluja eikä sääntöjä. Idempotentti.
create or replace function public.f_next_round_fixtures(p_comp text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with nr as (
    select round_no from public.fantasy_rounds
    where comp = p_comp and locked_at is null and deadline_at > now()
    order by round_no limit 1
  )
  select jsonb_build_object(
    'round_no', (select round_no from nr),
    'fixtures', coalesce((select jsonb_agg(jsonb_build_object('home_id', f.home_id, 'away_id', f.away_id, 'home', f.home_name, 'away', f.away_name,
                 'kickoff', f.kickoff, 'status', f.status) order by f.kickoff)
               from public.fantasy_fixtures f where f.comp = p_comp and f.round_no = (select round_no from nr)), '[]'::jsonb))
$$;
revoke all on function public.f_next_round_fixtures(text) from public, anon, authenticated;
grant execute on function public.f_next_round_fixtures(text) to service_role;
