-- Futista: oma kävijätilasto ilman evästeitä (hallintapaneeli /hallinta).
-- Yksi rivi / sivulataus: päivä (Helsinki), päiväkohtainen pseudonyymi kävijätunniste (ei IP-osoitetta, ei vertailukelpoinen
-- päivien välillä), sivun polku, lähde (esim. Google, Instagram), viittaavan sivuston verkkotunnus ja laitetyyppi.
-- Rivit poistetaan 400 päivän jälkeen. Idempotentti; ei muuta muita tauluja.

create table if not exists public.site_hits (
  id bigint generated always as identity primary key,
  day date not null,
  vid text not null check (vid ~ '^[0-9a-f]{16}$'),
  path text not null check (length(path) <= 200),
  source text not null check (length(source) <= 40),
  ref_host text check (length(ref_host) <= 100),
  device text not null check (device in ('mobile', 'tablet', 'desktop')),
  entry boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists site_hits_day_idx on public.site_hits (day, vid);
alter table public.site_hits enable row level security;
revoke all on table public.site_hits from public, anon, authenticated;

create or replace function public.s_hit(p_day date, p_vid text, p_path text, p_source text, p_ref text, p_device text, p_entry boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.site_hits (day, vid, path, source, ref_host, device, entry)
  values (p_day, p_vid, left(p_path, 200), left(p_source, 40), left(p_ref, 100), p_device, coalesce(p_entry, false));
  -- säilytysaika: satunnaisesti siivous (ei ajastusta tarvita)
  if random() < 0.002 then delete from public.site_hits where day < current_date - 400; end if;
  return jsonb_build_object('ok', true);
end $$;

-- Tilastot jaksolta. Kävijä = eri tunniste päivässä; lähde = päivän ensimmäisen saapumisen lähde.
create or replace function public.s_stats(p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = '' as $$
  with h as (select * from public.site_hits where day between p_from and p_to),
  f as (select distinct on (day, vid) day, vid, source, ref_host, device from h order by day, vid, entry desc, id)
  select jsonb_build_object(
    'first_day', (select min(day) from public.site_hits),
    'totals', jsonb_build_object('visitors', (select count(*) from f), 'views', (select count(*) from h)),
    'days', (select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'visitors', d.v, 'views', d.pv) order by d.day), '[]'::jsonb)
             from (select day, count(distinct vid) v, count(*) pv from h group by day) d),
    'sources', (select coalesce(jsonb_agg(jsonb_build_object('source', s.source, 'visitors', s.n) order by s.n desc, s.source), '[]'::jsonb)
                from (select source, count(*) n from f group by source) s),
    'day_sources', (select coalesce(jsonb_agg(jsonb_build_object('day', x.day, 'source', x.source, 'visitors', x.n)), '[]'::jsonb)
                    from (select day, source, count(*) n from f group by day, source) x),
    'refs', (select coalesce(jsonb_agg(jsonb_build_object('host', r.ref_host, 'visitors', r.n) order by r.n desc, r.ref_host), '[]'::jsonb)
             from (select ref_host, count(*) n from f where ref_host is not null group by ref_host order by n desc, ref_host limit 25) r),
    'pages', (select coalesce(jsonb_agg(jsonb_build_object('path', p.path, 'views', p.pv, 'visitors', p.v) order by p.pv desc, p.path), '[]'::jsonb)
              from (select path, count(*) pv, count(distinct (day, vid)) v from h group by path order by pv desc, path limit 25) p),
    'devices', (select coalesce(jsonb_agg(jsonb_build_object('device', d.device, 'visitors', d.n) order by d.n desc), '[]'::jsonb)
                from (select device, count(*) n from f group by device) d)
  )
$$;

revoke all on function public.s_hit(date, text, text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.s_stats(date, date) from public, anon, authenticated;
grant execute on function public.s_hit(date, text, text, text, text, text, boolean) to service_role;
grant execute on function public.s_stats(date, date) to service_role;
