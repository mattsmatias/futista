-- Futista Fantasy: joukkueen logo (aja 20261027_fantasy.sql:n jälkeen; idempotentti).
-- Logo on pieni kuvaus (muoto, kuvio, värit, symboli, nimikirjaimet), ei kuvatiedosto: ei latauksia, ei tallennustilaa,
-- ei toisten seurojen logoja. Palvelin tarkistaa sisällön (lib/fantasy-logo.ts); tietokanta rajaa koon ja tyypin.
-- Ilman tätä muutosta peli toimii: joukkueet näyttävät nimestä muodostetun oletuslogon, eikä logoa voi tallentaa.

alter table public.fantasy_teams add column if not exists logo jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fantasy_teams_logo_chk') then
    alter table public.fantasy_teams add constraint fantasy_teams_logo_chk
      check (logo is null or (jsonb_typeof(logo) = 'object' and octet_length(logo::text) <= 400));
  end if;
end $$;

-- Oman joukkueen logo (vain omistaja)
create or replace function public.f_team_logo(p_team bigint, p_user bigint, p_logo jsonb) returns jsonb
language sql security definer set search_path = '' as $$
  update public.fantasy_teams set logo = p_logo where id = p_team and user_id = p_user returning jsonb_build_object('ok', true)
$$;

-- Logot joukkuetunnisteilla (rankingia ja omaa näkymää varten): {"<id>": logo}
create or replace function public.f_team_logos(p_comp text, p_ids jsonb) returns jsonb
language sql security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(t.id::text, t.logo), '{}'::jsonb)
  from public.fantasy_teams t
  where t.comp = p_comp and t.logo is not null
    and t.id in (select (x #>> '{}')::bigint from jsonb_array_elements(case when jsonb_typeof(p_ids) = 'array' then p_ids else '[]'::jsonb end) x
                 where jsonb_typeof(x) = 'number' limit 200)
$$;

revoke all on function public.f_team_logo(bigint, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.f_team_logos(text, jsonb) from public, anon, authenticated;
grant execute on function public.f_team_logo(bigint, bigint, jsonb) to service_role;
grant execute on function public.f_team_logos(text, jsonb) to service_role;

-- Poisto:
-- drop function if exists public.f_team_logo(bigint, bigint, jsonb);
-- drop function if exists public.f_team_logos(text, jsonb);
-- alter table public.fantasy_teams drop constraint if exists fantasy_teams_logo_chk;
-- alter table public.fantasy_teams drop column if exists logo;
