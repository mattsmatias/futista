-- Futista Fantasy: joukkueen nimen vaihto. Ensimmäinen vaihto on ilmainen, sen jälkeen jokainen vaihto maksaa 100 Futista-kolikkoa.
-- Idempotentti; ei muuta olemassa olevia nimiä eikä saldoja.
--  * fantasy_teams.renames: tehtyjen nimenvaihtojen määrä (luonnissa annettu nimi ei ole vaihto)
--  * kolikkokirjaus kind 'rename' (ref rename:<pyyntötunniste> → sama pyyntö ei veloita kahdesti)
--  * nimi ja veloitus samassa tapahtumassa, joukkue- ja lompakkolukolla (samanaikaiset pyynnöt eivät ohita hintaa)

alter table public.fantasy_teams add column if not exists renames integer not null default 0 check (renames >= 0);

alter table public.fantasy_coin_ledger drop constraint if exists fantasy_coin_ledger_kind_check;
alter table public.fantasy_coin_ledger add constraint fantasy_coin_ledger_kind_check
  check (kind in ('start','invite','round','round_fix','round_waived','pack','rename'));

-- Seuraavan vaihdon hinta ja saldo (näytetään ennen vahvistusta)
create or replace function public.f_rename_info(p_team bigint, p_user bigint) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object('renames', t.renames, 'price', case when t.renames = 0 then 0 else 100 end,
      'balance', coalesce((select w.balance from public.fantasy_wallets w where w.user_id = p_user), 0))
    from public.fantasy_teams t where t.id = p_team and t.user_id = p_user), jsonb_build_object('error', 'forbidden'))
$$;

-- Nimen vaihto. p_price = käyttäjän näkemä hinta: jos se ei vastaa palvelimen hintaa, ei vaihdeta (näytetään uusi hinta).
-- Sama nimi uudelleen (esim. uusintapyyntö) → ei muutosta eikä veloitusta.
create or replace function public.f_team_rename_v2(p_team bigint, p_user bigint, p_name text, p_request text, p_price integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_t record; v_price int; v_bal int;
begin
  if p_request is null or p_request !~ '^[a-zA-Z0-9_-]{8,64}$' then return jsonb_build_object('error', 'request'); end if;
  select * into v_t from public.fantasy_teams where id = p_team and user_id = p_user for update;
  if not found then return jsonb_build_object('error', 'forbidden'); end if;
  if v_t.name = p_name then return jsonb_build_object('ok', true, 'same', true, 'cost', 0, 'renames', v_t.renames); end if;
  v_price := case when v_t.renames = 0 then 0 else 100 end;
  if p_price is distinct from v_price then return jsonb_build_object('error', 'price', 'price', v_price); end if;
  if v_price > 0 then
    v_bal := public.f_coins_lock(p_user);
    if v_bal < v_price then return jsonb_build_object('error', 'funds', 'balance', v_bal, 'price', v_price); end if;
    if not public.f_coins_add(p_user, -v_price, 'rename', format('rename:%s', p_request),
        jsonb_build_object('team', p_team, 'from', v_t.name, 'to', p_name)) then
      return jsonb_build_object('error', 'replay'); -- sama pyyntötunniste jo käytetty toiseen vaihtoon
    end if;
  end if;
  update public.fantasy_teams set name = p_name, renames = renames + 1 where id = p_team;
  return jsonb_build_object('ok', true, 'cost', v_price, 'renames', v_t.renames + 1,
    'balance', coalesce((select balance from public.fantasy_wallets where user_id = p_user), 0));
end $$;

-- Vanha maksuton vaihtofunktio pois käytöstä (vain palvelin kutsui sitä)
revoke all on function public.f_team_rename(bigint, bigint, text) from service_role;

do $$ declare f text; begin
  foreach f in array array['f_rename_info(bigint,bigint)','f_team_rename_v2(bigint,bigint,text,text,integer)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
