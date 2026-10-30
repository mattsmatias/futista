-- Futista Fantasy: pelistä poistettujen sarjojen ottelut ja niiden takia syntyneet tyhjät kierrokset pois (idempotentti).
-- Tausta 30.10.2026: Veikkausliiga ja MLS olivat pelissä hetken; niiden ottelut ja kierrokset (myös maaottelutaukojen viikoille)
-- jäivät tietokantaan → kierrosten juokseva numerointi sekaisin ja tämän viikon kierros ei olisi koskaan valmistunut
-- (ottelujen tuloksia ei enää haeta). Päivitys kutsuu tätä vain, kun kaikkien pelin sarjojen ottelulistat saatiin.
--  * poistetaan ottelut, joita ei ole pelin sarjojen ottelulistassa (p_keep) ja joilla ei ole pelaajatilastoja
--  * poistetaan kierrokset, joilla ei ole otteluita eikä yhdenkään joukkueen tilannekuvaa tai pisteitä

drop function if exists public.f_fixtures_prune(text, integer[]);
create or replace function public.f_fixtures_prune(p_comp text, p_keep jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_fx int; v_rounds int; v_keep integer[];
begin
  if p_keep is null or jsonb_typeof(p_keep) <> 'array' or jsonb_array_length(p_keep) = 0 then return jsonb_build_object('error', 'empty'); end if;
  v_keep := array(select (x)::int from jsonb_array_elements_text(p_keep) x);
  delete from public.fantasy_fixtures f
  where f.comp = p_comp and not (f.fixture_id = any (v_keep)) and f.stats_at is null
    and not exists (select 1 from public.fantasy_player_stats s where s.comp = f.comp and s.fixture_id = f.fixture_id);
  get diagnostics v_fx = row_count;
  delete from public.fantasy_rounds r
  where r.comp = p_comp
    and not exists (select 1 from public.fantasy_fixtures f where f.comp = p_comp and f.round_no = r.round_no)
    and not exists (select 1 from public.fantasy_gw_picks g join public.fantasy_teams t on t.id = g.team_id
                    where t.comp = p_comp and g.round_no = r.round_no)
    and not exists (select 1 from public.fantasy_round_points p join public.fantasy_teams t on t.id = p.team_id
                    where t.comp = p_comp and p.round_no = r.round_no);
  get diagnostics v_rounds = row_count;
  return jsonb_build_object('fixtures', v_fx, 'rounds', v_rounds);
end $$;

revoke all on function public.f_fixtures_prune(text, jsonb) from public, anon, authenticated;
grant execute on function public.f_fixtures_prune(text, jsonb) to service_role;
