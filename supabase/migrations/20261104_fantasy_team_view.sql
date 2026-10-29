-- Futista Fantasy: toisen joukkueen esikatselu rankingista (idempotentti; ei muuta tauluja).
-- Näytetään vain lukittujen kierrosten tilannekuvat (ei seuraavan kierroksen valintoja → siirtoja ei voi kopioida ennen
-- määräaikaa), kierroksen pisteet erittelyineen, kauden pisteet ja valitut korttityylit (vain omistetut versiot).
-- Ei käyttäjätunnusta eikä muita henkilötietoja. Vain joukkueet, jotka ovat mukana rankingissa (first_round asetettu).

create or replace function public.f_team_view(p_comp text, p_team bigint, p_round integer) returns jsonb
language sql stable security definer set search_path = '' as $$
  with t as (
    select id, name, logo, user_id from public.fantasy_teams where id = p_team and comp = p_comp and first_round is not null
  ), locked as (
    select g.round_no from public.fantasy_gw_picks g
    join public.fantasy_rounds r on r.comp = p_comp and r.round_no = g.round_no and r.locked_at is not null
    where g.team_id = p_team
  ), pick as (
    select coalesce((select round_no from locked where round_no = p_round), (select max(round_no) from locked)) as rn
  )
  select case when not exists (select 1 from t) then jsonb_build_object('error', 'notfound') else jsonb_build_object(
    'id', p_team,
    'name', (select name from t),
    'logo', (select logo from t),
    'total', coalesce((select sum(total) from public.fantasy_round_points where team_id = p_team), 0),
    'rounds', coalesce((select jsonb_agg(round_no order by round_no) from locked), '[]'::jsonb),
    'round', (select rn from pick),
    'picks', (select g.picks from public.fantasy_gw_picks g where g.team_id = p_team and g.round_no = (select rn from pick)),
    'points', (select jsonb_build_object('points', p.points, 'hits', p.hits, 'total', p.total, 'breakdown', p.breakdown, 'provisional', p.provisional)
               from public.fantasy_round_points p where p.team_id = p_team and p.round_no = (select rn from pick)),
    'styles', coalesce((select jsonb_object_agg(s.player_id::text, s.version) from public.fantasy_card_styles s, t
                  where s.user_id = t.user_id and s.comp = p_comp
                    and exists (select 1 from public.fantasy_cards c where c.user_id = t.user_id and c.comp = p_comp and c.player_id = s.player_id
                                and coalesce(c.version, c.pack) = s.version)), '{}'::jsonb)
  ) end
$$;

revoke all on function public.f_team_view(text, bigint, integer) from public, anon, authenticated;
grant execute on function public.f_team_view(text, bigint, integer) to service_role;
