-- Futista Fantasy: korttiversiot (Silver / Gold / Elite) ja oma korttityyli joukkueen kentälle.
-- Aja 20261031_fantasy_coins_packs.sql:n jälkeen. Idempotentti. Ei poista eikä nollaa olemassa olevia kortteja.
--
-- Säännöt
--  * Korttiversio vaikuttaa vain ulkoasuun ja kokoelmaan: hinta, pisteet, budjetti, siirrot ja ranking eivät muutu.
--  * Peruskortti kuuluu kaikille pelaajille, eikä sitä tallenneta (tyylivalinnan puuttuminen = perus).
--  * Pakan jokaisen kortin versio arvotaan palvelimella pelaajasta erillään: Silver-pakka Silver tai Elite,
--    Gold-pakka Gold tai Elite. Elite-osuus promilleina pakkatyypissä (oletus Silver 30 ‰ = 3 %, Gold 50 ‰ = 5 %).
--  * Olemassa olevat kortit: versioksi pakan oma versio (Silver-pakan kortti = Silver, Gold-pakan = Gold).
--  * Käyttäjä voi valita kentälle vain omistamansa version tai peruskortin; tarkistus tietokantafunktiossa.
--  * Vanha f_pack_open jätetään ennalleen (tuotannon nykyinen koodi käyttää sitä, kunnes uusi versio julkaistaan);
--    sen tallentamat kortit saavat version pakan mukaan (oletus alla).

alter table public.fantasy_pack_types add column if not exists base_version text;
alter table public.fantasy_pack_types add column if not exists elite_permille integer;
update public.fantasy_pack_types set base_version = id where base_version is null and id in ('silver', 'gold');
update public.fantasy_pack_types set elite_permille = case id when 'silver' then 30 when 'gold' then 50 else 0 end where elite_permille is null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fantasy_pack_types_elite_chk') then
    alter table public.fantasy_pack_types add constraint fantasy_pack_types_elite_chk check (elite_permille between 0 and 1000);
  end if;
end $$;

alter table public.fantasy_cards add column if not exists version text;
-- migraatio: aiemmat kortit pakan version mukaan (ei poisteta eikä muuteta muuta)
update public.fantasy_cards set version = pack where version is null and pack in ('silver', 'gold');
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fantasy_cards_version_chk') then
    alter table public.fantasy_cards add constraint fantasy_cards_version_chk check (version is null or version in ('silver', 'gold', 'elite'));
  end if;
end $$;
create index if not exists fantasy_cards_user_ver on public.fantasy_cards (user_id, comp, player_id, version);

-- Tyylivalinta kentälle (rivi puuttuu = peruskortti)
create table if not exists public.fantasy_card_styles (
  user_id    bigint not null references public.fantasy_users(id) on delete cascade,
  comp       text not null,
  player_id  integer not null,
  version    text not null check (version in ('silver', 'gold', 'elite')),
  updated_at timestamptz not null default now(),
  primary key (user_id, comp, player_id)
);
alter table public.fantasy_card_styles enable row level security;
revoke all on public.fantasy_card_styles from anon, authenticated;
grant select, insert, update, delete on public.fantasy_card_styles to service_role;

-- Pakkatyypit versioineen (sama kuin f_pack_types + base_version, elite_permille)
create or replace function public.f_pack_types_v2(p_comp text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'price', t.price, 'cards', t.cards, 'min_price', t.min_price, 'max_price', t.max_price,
    'base_version', coalesce(t.base_version, t.id), 'elite_permille', coalesce(t.elite_permille, 0),
    'eligible', (select count(*) from public.fantasy_players p where p.comp = p_comp and p.active
                   and (t.min_price is null or p.price >= t.min_price) and (t.max_price is null or p.price < t.max_price)),
    'by_pos', (select coalesce(jsonb_object_agg(x.position, x.n), '{}'::jsonb) from (select p.position, count(*) as n from public.fantasy_players p
                 where p.comp = p_comp and p.active and (t.min_price is null or p.price >= t.min_price) and (t.max_price is null or p.price < t.max_price)
                 group by p.position) x)) order by t.sort), '[]'::jsonb)
  from public.fantasy_pack_types t where t.active
$$;

-- Avaus kortteineen (versio, uusi / kaksoiskappale)
create or replace function public.f_pack_open_get_v2(p_user bigint, p_open bigint) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', o.id, 'pack', o.pack, 'price', o.price, 'eligible', o.eligible, 'created_at', o.created_at, 'seen', o.seen_at is not null,
    'cards', coalesce((select jsonb_agg(jsonb_build_object('slot', c.slot, 'player_id', c.player_id, 'price', c.price, 'dup', c.dup,
        'version', coalesce(c.version, c.pack),
        'name', p.name, 'team', p.team_name, 'team_id', p.team_id, 'logo', p.team_logo, 'pos', p.position, 'photo', p.photo, 'league', p.league) order by c.slot)
      from public.fantasy_cards c left join public.fantasy_players p on p.comp = c.comp and p.player_id = c.player_id where c.open_id = o.id), '[]'::jsonb))
  from public.fantasy_pack_opens o where o.id = p_open and o.user_id = p_user
$$;

-- Pakan avaus versioineen: kuten f_pack_open, lisäksi p_versions (pituus = korttimäärä; kukin pakan perusversio tai elite).
-- Kaksoiskappale = sama pelaaja ja sama versio omistettu jo ennen avausta tai aiemmin samassa pakassa.
create or replace function public.f_pack_open_v2(p_user bigint, p_comp text, p_pack text, p_request text, p_players jsonb, p_versions jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_t record; v_open bigint; v_bal int; v_n int; v_pid int; v_ver text; v_slot int := 0; v_price numeric; v_keys text[] := '{}'; v_base text;
begin
  select id into v_open from public.fantasy_pack_opens where user_id = p_user and request_id = p_request;
  if v_open is not null then return public.f_pack_open_get_v2(p_user, v_open) || jsonb_build_object('replay', true); end if;
  select * into v_t from public.fantasy_pack_types where id = p_pack and active;
  if not found then return jsonb_build_object('error', 'notype'); end if;
  v_base := coalesce(v_t.base_version, v_t.id);
  if jsonb_typeof(p_players) <> 'array' or jsonb_array_length(p_players) <> v_t.cards
     or jsonb_typeof(p_versions) <> 'array' or jsonb_array_length(p_versions) <> v_t.cards then return jsonb_build_object('error', 'cards'); end if;
  if exists (select 1 from jsonb_array_elements_text(p_versions) x where x not in (v_base, 'elite')
             or (x = 'elite' and coalesce(v_t.elite_permille, 0) = 0)) then return jsonb_build_object('error', 'version'); end if;
  v_bal := public.f_coins_lock(p_user);
  select id into v_open from public.fantasy_pack_opens where user_id = p_user and request_id = p_request;
  if v_open is not null then return public.f_pack_open_get_v2(p_user, v_open) || jsonb_build_object('replay', true); end if;
  select count(*) into v_n from public.fantasy_players p where p.comp = p_comp and p.active
    and (v_t.min_price is null or p.price >= v_t.min_price) and (v_t.max_price is null or p.price < v_t.max_price);
  if v_n = 0 then return jsonb_build_object('error', 'empty'); end if;
  if v_bal < v_t.price then return jsonb_build_object('error', 'funds', 'balance', v_bal, 'price', v_t.price); end if;
  for v_pid in select (x)::int from jsonb_array_elements_text(p_players) x loop
    if not exists (select 1 from public.fantasy_players p where p.comp = p_comp and p.player_id = v_pid and p.active
        and (v_t.min_price is null or p.price >= v_t.min_price) and (v_t.max_price is null or p.price < v_t.max_price)) then
      return jsonb_build_object('error', 'stale');
    end if;
  end loop;
  insert into public.fantasy_pack_opens (user_id, request_id, pack, comp, price, cards, eligible)
  values (p_user, p_request, p_pack, p_comp, v_t.price, v_t.cards, v_n) returning id into v_open;
  for v_slot in 1 .. v_t.cards loop
    v_pid := (p_players->>(v_slot - 1))::int;
    v_ver := p_versions->>(v_slot - 1);
    select price into v_price from public.fantasy_players where comp = p_comp and player_id = v_pid;
    insert into public.fantasy_cards (user_id, open_id, slot, pack, comp, player_id, price, dup, version)
    values (p_user, v_open, v_slot, p_pack, p_comp, v_pid, v_price,
      (v_pid::text || ':' || v_ver) = any(v_keys)
        or exists (select 1 from public.fantasy_cards c where c.user_id = p_user and c.comp = p_comp and c.player_id = v_pid
                   and coalesce(c.version, c.pack) = v_ver and c.open_id <> v_open),
      v_ver);
    v_keys := v_keys || (v_pid::text || ':' || v_ver);
  end loop;
  perform public.f_coins_add(p_user, -v_t.price, 'pack', format('pack:%s', v_open), jsonb_build_object('pack', p_pack, 'open', v_open));
  return public.f_pack_open_get_v2(p_user, v_open) || jsonb_build_object('replay', false);
end $$;

-- Kokoelma pelaaja + versio -riveittäin
create or replace function public.f_collection_v2(p_user bigint, p_comp text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'cards', (select count(*) from public.fantasy_cards where user_id = p_user and comp = p_comp),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('player_id', x.player_id, 'version', x.version, 'count', x.n, 'first_at', x.first_at,
        'name', p.name, 'team', p.team_name, 'team_id', p.team_id, 'logo', p.team_logo, 'pos', p.position, 'price', p.price, 'photo', p.photo, 'league', p.league)
        order by case x.version when 'elite' then 0 when 'gold' then 1 else 2 end, p.price desc nulls last, p.name)
      from (select player_id, coalesce(version, pack) as version, count(*) as n, min(created_at) as first_at
            from public.fantasy_cards where user_id = p_user and comp = p_comp group by player_id, coalesce(version, pack)) x
      left join public.fantasy_players p on p.comp = p_comp and p.player_id = x.player_id), '[]'::jsonb))
$$;

-- Omat korttityylit: valinnat (pelaaja → versio) ja omistetut versiot pelaajittain
create or replace function public.f_card_styles(p_user bigint, p_comp text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'selected', coalesce((select jsonb_object_agg(s.player_id::text, s.version) from public.fantasy_card_styles s
                  where s.user_id = p_user and s.comp = p_comp
                    and exists (select 1 from public.fantasy_cards c where c.user_id = p_user and c.comp = p_comp and c.player_id = s.player_id
                                and coalesce(c.version, c.pack) = s.version)), '{}'::jsonb),
    'owned', coalesce((select jsonb_object_agg(x.player_id::text, x.versions) from (
                  select player_id, jsonb_agg(jsonb_build_object('version', v, 'count', n) order by case v when 'elite' then 0 when 'gold' then 1 else 2 end) as versions
                  from (select player_id, coalesce(version, pack) as v, count(*) as n from public.fantasy_cards
                        where user_id = p_user and comp = p_comp group by player_id, coalesce(version, pack)) y group by player_id) x), '{}'::jsonb))
$$;

-- Tyylin valinta: 'base' = peruskortti (poistaa valinnan); muu versio vain, jos käyttäjä omistaa sen
create or replace function public.f_card_style_set(p_user bigint, p_comp text, p_player integer, p_version text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if p_version = 'base' then
    delete from public.fantasy_card_styles where user_id = p_user and comp = p_comp and player_id = p_player;
    return jsonb_build_object('ok', true, 'version', 'base');
  end if;
  if p_version not in ('silver', 'gold', 'elite') then return jsonb_build_object('error', 'version'); end if;
  if not exists (select 1 from public.fantasy_cards c where c.user_id = p_user and c.comp = p_comp and c.player_id = p_player
                 and coalesce(c.version, c.pack) = p_version) then
    return jsonb_build_object('error', 'notowned');
  end if;
  insert into public.fantasy_card_styles (user_id, comp, player_id, version) values (p_user, p_comp, p_player, p_version)
  on conflict (user_id, comp, player_id) do update set version = excluded.version, updated_at = now();
  return jsonb_build_object('ok', true, 'version', p_version);
end $$;

do $$ declare f text; begin
  foreach f in array array['f_pack_types_v2(text)','f_pack_open_get_v2(bigint,bigint)','f_pack_open_v2(bigint,text,text,text,jsonb,jsonb)',
    'f_collection_v2(bigint,text)','f_card_styles(bigint,text)','f_card_style_set(bigint,text,integer,text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- Poisto: drop function public.f_pack_types_v2, f_pack_open_get_v2, f_pack_open_v2, f_collection_v2, f_card_styles, f_card_style_set;
-- drop table public.fantasy_card_styles; alter table public.fantasy_cards drop column version;
-- alter table public.fantasy_pack_types drop column base_version, drop column elite_permille;
