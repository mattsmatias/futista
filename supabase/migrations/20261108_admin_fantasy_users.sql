-- Hallintapaneeli: Futista Fantasyn käyttäjämäärät (vain luku, vain service_role; paneeli näyttää vain ylläpitäjille).
-- Ei henkilötietoja: vain lukumääriä. Päivät Helsingin aikaa. Idempotentti.
create or replace function public.f_admin_fantasy(p_from date, p_to date, p_prev_from date, p_prev_to date) returns jsonb
language sql stable security definer set search_path = '' as $$
  with u as (select (created_at at time zone 'Europe/Helsinki')::date as d from public.fantasy_users)
  select jsonb_build_object(
    'users', (select count(*) from public.fantasy_users),
    'today', (select count(*) from u where d = p_to),
    'period', (select count(*) from u where d between p_from and p_to),
    'prev', (select count(*) from u where d between p_prev_from and p_prev_to),
    'teams', (select count(distinct user_id) from public.fantasy_teams),
    'saved', (select count(distinct user_id) from public.fantasy_teams where first_round is not null),
    'days', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'n', c) order by d) from (select d, count(*) as c from u where d between p_from and p_to group by d) x), '[]'::jsonb))
$$;
revoke all on function public.f_admin_fantasy(date, date, date, date) from public, anon, authenticated;
grant execute on function public.f_admin_fantasy(date, date, date, date) to service_role;
