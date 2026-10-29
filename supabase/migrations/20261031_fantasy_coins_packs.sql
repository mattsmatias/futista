-- Futista Fantasy: Futista-kolikot, silver- ja gold-pakat sekä pelaajakokoelma. Aja 20261030_fantasy_round_fixtures.sql:n jälkeen.
-- Lisää vain uusia tauluja ja funktioita; nykyiset joukkueet, budjetti, siirrot, pisteet ja ranking eivät muutu. Idempotentti.
--
-- Turvallisuus (kuten 20261027_fantasy.sql)
--  * RLS päällä, ei käytäntöjä anonille/authenticatedille → selain ei lue eikä kirjoita tauluja suoraan.
--  * Kaikki saldomuutokset SECURITY DEFINER -funktioissa palvelimen kautta; käyttäjä tulee palvelimen istunnosta.
--  * Saldo muuttuu vain kirjanpitorivin kanssa samassa tapahtumassa; rivi on yksilöllinen (user_id, ref) → sama palkinto
--    tai sama avaus ei voi kirjautua kahdesti. Lompakkorivi lukitaan (FOR UPDATE) → samanaikaiset avaukset jonoutuvat.
--  * Saldo ei voi mennä negatiiviseksi (check-ehto).
--  * Pakan kortit arvotaan palvelimella (Node crypto.randomInt) tasajakaumasta; f_pack_open tarkistaa jokaisen kortin
--    kelpoisuuden, veloittaa ja tallentaa kortit yhdessä tapahtumassa. Sama pyyntötunniste uudelleen → sama tulos.

-- ---------------- Säännöt (muutettavissa hallitusti; jo maksetut kierrokset käyttävät tallennettua sääntöään) ----------------
create table if not exists public.fantasy_coin_rules (
  id                  integer primary key check (id = 1),
  start_bonus         integer not null check (start_bonus >= 0),
  round_participation integer not null check (round_participation >= 0),
  round_per_point     integer not null check (round_per_point >= 0),
  round_point_cap     integer not null check (round_point_cap >= 0),
  invite_bonus        integer not null check (invite_bonus >= 0),
  invite_daily_cap    integer not null check (invite_daily_cap >= 0),
  updated_at          timestamptz not null default now()
);
insert into public.fantasy_coin_rules (id, start_bonus, round_participation, round_per_point, round_point_cap, invite_bonus, invite_daily_cap)
values (1, 150, 50, 1, 100, 100, 10) on conflict (id) do nothing;

create table if not exists public.fantasy_wallets (
  user_id    bigint primary key references public.fantasy_users(id) on delete cascade,
  balance    integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

-- Kirjanpito: jokainen ansainta, veloitus ja oikaisu omana rivinään
create table if not exists public.fantasy_coin_ledger (
  id            bigint generated always as identity primary key,
  user_id       bigint not null references public.fantasy_users(id) on delete cascade,
  amount        integer not null,
  balance_after integer not null check (balance_after >= 0),
  kind          text not null check (kind in ('start','invite','round','round_fix','round_waived','pack')),
  ref           text not null check (char_length(ref) between 1 and 120),
  info          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  unique (user_id, ref)
);
create index if not exists fantasy_coin_ledger_user on public.fantasy_coin_ledger (user_id, id desc);

-- Kierrospalkinnot: peruste, käytetty sääntö ja oikaisut. effective = paid - waived = entitled, kun tilanne on tasattu.
create table if not exists public.fantasy_round_rewards (
  user_id    bigint not null references public.fantasy_users(id) on delete cascade,
  comp       text not null,
  round_no   integer not null,
  team_id    bigint not null,
  rule       jsonb not null,          -- {participation, per_point, cap} maksuhetkellä
  points     integer not null,        -- kierroksen pisteet (total), joista palkinto laskettiin
  entitled   integer not null check (entitled >= 0),
  paid       integer not null check (paid >= 0),  -- annetut kolikot yhteensä (miinus takaisin peritty)
  waived     integer not null default 0 check (waived >= 0), -- takaisin perimättä jätetty (kolikot jo käytetty)
  fixes      integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, comp, round_no)
);

-- Kutsut: kuka kutsui tilin luonut käyttäjän (yksi kutsuja per uusi tili)
create table if not exists public.fantasy_referrals (
  invitee      bigint primary key references public.fantasy_users(id) on delete cascade,
  inviter      bigint not null references public.fantasy_users(id) on delete cascade,
  inviter_team bigint,
  rewarded     boolean not null,
  created_at   timestamptz not null default now()
);
create index if not exists fantasy_referrals_inviter on public.fantasy_referrals (inviter, created_at);

-- ---------------- Pakat ----------------
create table if not exists public.fantasy_pack_types (
  id        text primary key check (id ~ '^[a-z]{2,20}$'),
  name      text not null,
  price     integer not null check (price > 0),
  cards     integer not null check (cards between 1 and 10),
  min_price numeric(4,1),   -- vähintään (mukaan lukien); null = ei alarajaa
  max_price numeric(4,1),   -- alle (ei mukaan lukien); null = ei ylärajaa
  active    boolean not null default true,
  sort      integer not null default 0
);
insert into public.fantasy_pack_types (id, name, price, cards, min_price, max_price, sort) values
  ('silver', 'Silver-pakka', 100, 3, null, 9.0, 1),
  ('gold',   'Gold-pakka',   250, 3, 9.0, null, 2)
on conflict (id) do nothing;

create table if not exists public.fantasy_pack_opens (
  id          bigint generated always as identity primary key,
  user_id     bigint not null references public.fantasy_users(id) on delete cascade,
  request_id  text not null check (request_id ~ '^[A-Za-z0-9_-]{16,64}$'),
  pack        text not null references public.fantasy_pack_types(id),
  comp        text not null,
  price       integer not null,
  cards       integer not null,
  eligible    integer not null,     -- arvontajoukon koko avaushetkellä (todennäköisyys 1/eligible per kortti)
  created_at  timestamptz not null default now(),
  seen_at     timestamptz,          -- milloin käyttäjä näki paljastuksen (null = avattu, mutta ei vielä katsottu)
  unique (user_id, request_id)
);
create index if not exists fantasy_pack_opens_user on public.fantasy_pack_opens (user_id, id desc);

create table if not exists public.fantasy_cards (
  id         bigint generated always as identity primary key,
  user_id    bigint not null references public.fantasy_users(id) on delete cascade,
  open_id    bigint not null references public.fantasy_pack_opens(id) on delete cascade,
  slot       integer not null,
  pack       text not null,
  comp       text not null,
  player_id  integer not null,
  price      numeric(4,1) not null,  -- fantasyhinta avaushetkellä
  dup        boolean not null,       -- omistettu jo ennen avausta tai tuli aiemmin samasta pakasta
  created_at timestamptz not null default now(),
  unique (open_id, slot)
);
create index if not exists fantasy_cards_user on public.fantasy_cards (user_id, player_id);

do $$ declare t text; begin
  foreach t in array array['fantasy_coin_rules','fantasy_wallets','fantasy_coin_ledger','fantasy_round_rewards','fantasy_referrals',
    'fantasy_pack_types','fantasy_pack_opens','fantasy_cards'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

-- =====================================================================
-- Funktiot (vain service_role)
-- =====================================================================

-- Lompakon lukitus (luo tarvittaessa). Kutsutaan ennen jokaista saldomuutosta samassa tapahtumassa.
create or replace function public.f_coins_lock(p_user bigint) returns integer
language plpgsql security definer set search_path = '' as $$
declare v int;
begin
  insert into public.fantasy_wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  select balance into v from public.fantasy_wallets where user_id = p_user for update;
  return v;
end $$;

-- Kirjaus + saldo. Sama ref toiseen kertaan → ei muutosta (palauttaa false). Vaatii f_coins_lockin samassa tapahtumassa.
create or replace function public.f_coins_add(p_user bigint, p_amount integer, p_kind text, p_ref text, p_info jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_bal int; v_id bigint;
begin
  select balance into v_bal from public.fantasy_wallets where user_id = p_user for update;
  if v_bal + p_amount < 0 then raise exception 'negative balance'; end if;
  insert into public.fantasy_coin_ledger (user_id, amount, balance_after, kind, ref, info)
  values (p_user, p_amount, v_bal + p_amount, p_kind, p_ref, coalesce(p_info, '{}'::jsonb))
  on conflict (user_id, ref) do nothing returning id into v_id;
  if v_id is null then return false; end if;
  update public.fantasy_wallets set balance = v_bal + p_amount, updated_at = now() where user_id = p_user;
  return true;
end $$;

-- Ansaintojen tasaus käyttäjälle (idempotentti; voidaan kutsua milloin tahansa):
--  * aloituspalkinto, kun käyttäjällä on ensimmäinen tallennettu joukkue (first_round asetettu) – kerran käyttäjää kohden
--  * kierrospalkinto jokaisesta lopullisesta kierroksesta (status final, pisteet ei alustavia), jolle käyttäjän joukkueella
--    on määräajalla otettu tilannekuva (= kelvollinen joukkue tallennettu ajoissa)
--  * pistekorjaus: uusi oikeus ≠ aiempi → erotus kirjataan (round_fix); takaisinperintä enintään saldon verran,
--    loppu kirjataan perimättä jätetyksi (round_waived, 0 kolikkoa) eikä sitä peritä myöhemmin
create or replace function public.f_coins_settle(p_user bigint, p_comp text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_rules record; v_r record; v_rr record; v_has boolean; v_ent int; v_eff int; v_delta int; v_bal int; v_take int; v_rule jsonb;
begin
  select * into v_rules from public.fantasy_coin_rules where id = 1;
  v_bal := public.f_coins_lock(p_user);
  if exists (select 1 from public.fantasy_teams where user_id = p_user and first_round is not null) then
    perform public.f_coins_add(p_user, v_rules.start_bonus, 'start', 'start', jsonb_build_object('reason', 'first_team'));
  end if;
  for v_r in
    select t.id as team_id, r.round_no, p.total
    from public.fantasy_teams t
    join public.fantasy_rounds r on r.comp = t.comp and r.status = 'final'
    join public.fantasy_gw_picks g on g.team_id = t.id and g.round_no = r.round_no
    join public.fantasy_round_points p on p.team_id = t.id and p.round_no = r.round_no and not p.provisional
    where t.user_id = p_user and t.comp = p_comp
    order by r.round_no
  loop
    select * into v_rr from public.fantasy_round_rewards where user_id = p_user and comp = p_comp and round_no = v_r.round_no for update;
    v_has := found;
    v_rule := case when v_has then v_rr.rule else jsonb_build_object('participation', v_rules.round_participation, 'per_point', v_rules.round_per_point, 'cap', v_rules.round_point_cap) end;
    v_ent := (v_rule->>'participation')::int + least((v_rule->>'cap')::int, greatest(0, v_r.total) * (v_rule->>'per_point')::int);
    if not v_has then
      insert into public.fantasy_round_rewards (user_id, comp, round_no, team_id, rule, points, entitled, paid)
      values (p_user, p_comp, v_r.round_no, v_r.team_id, v_rule, v_r.total, v_ent, v_ent);
      perform public.f_coins_add(p_user, v_ent, 'round', format('round:%s:%s', p_comp, v_r.round_no),
        jsonb_build_object('round', v_r.round_no, 'points', v_r.total, 'participation', v_rule->'participation', 'from_points', v_ent - (v_rule->>'participation')::int));
    else
      v_eff := v_rr.paid - v_rr.waived;
      v_delta := v_ent - v_eff;
      if v_delta <> 0 then
        select balance into v_bal from public.fantasy_wallets where user_id = p_user;
        if v_delta > 0 then
          perform public.f_coins_add(p_user, v_delta, 'round_fix', format('round:%s:%s:fix%s', p_comp, v_r.round_no, v_rr.fixes + 1),
            jsonb_build_object('round', v_r.round_no, 'points_before', v_rr.points, 'points', v_r.total));
          update public.fantasy_round_rewards set paid = paid + v_delta, entitled = v_ent, points = v_r.total, fixes = fixes + 1, updated_at = now()
          where user_id = p_user and comp = p_comp and round_no = v_r.round_no;
        else
          v_take := least(-v_delta, v_bal);
          if v_take > 0 then
            perform public.f_coins_add(p_user, -v_take, 'round_fix', format('round:%s:%s:fix%s', p_comp, v_r.round_no, v_rr.fixes + 1),
              jsonb_build_object('round', v_r.round_no, 'points_before', v_rr.points, 'points', v_r.total));
          end if;
          if -v_delta - v_take > 0 then
            perform public.f_coins_add(p_user, 0, 'round_waived', format('round:%s:%s:waived%s', p_comp, v_r.round_no, v_rr.fixes + 1),
              jsonb_build_object('round', v_r.round_no, 'uncollected', -v_delta - v_take, 'points_before', v_rr.points, 'points', v_r.total));
          end if;
          update public.fantasy_round_rewards set paid = paid - v_take, waived = waived + (-v_delta - v_take), entitled = v_ent,
            points = v_r.total, fixes = fixes + 1, updated_at = now()
          where user_id = p_user and comp = p_comp and round_no = v_r.round_no;
        end if;
      end if;
    end if;
  end loop;
  return jsonb_build_object('balance', (select balance from public.fantasy_wallets where user_id = p_user));
end $$;

-- Kaikkien kilpailun joukkueiden tasaus (päivitysajo pisteiden laskennan jälkeen)
create or replace function public.f_coins_settle_comp(p_comp text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_u bigint; v_n int := 0;
begin
  for v_u in select distinct t.user_id from public.fantasy_teams t where t.comp = p_comp and t.first_round is not null loop
    perform public.f_coins_settle(v_u, p_comp);
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('users', v_n);
end $$;

-- Kutsu: uusi tili luotiin kutsulinkillä → kutsujalle palkinto (enintään invite_daily_cap palkittua kutsua / 24 h)
create or replace function public.f_referral_record(p_invitee bigint, p_inviter_team bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_rules record; v_inviter bigint; v_recent int; v_reward boolean;
begin
  select user_id into v_inviter from public.fantasy_teams where id = p_inviter_team;
  if v_inviter is null or v_inviter = p_invitee then return jsonb_build_object('rewarded', false, 'reason', 'invalid'); end if;
  if exists (select 1 from public.fantasy_referrals where invitee = p_invitee) then return jsonb_build_object('rewarded', false, 'reason', 'exists'); end if;
  select * into v_rules from public.fantasy_coin_rules where id = 1;
  perform public.f_coins_lock(v_inviter);
  select count(*) into v_recent from public.fantasy_referrals where inviter = v_inviter and rewarded and created_at > now() - interval '24 hours';
  v_reward := v_recent < v_rules.invite_daily_cap and v_rules.invite_bonus > 0;
  insert into public.fantasy_referrals (invitee, inviter, inviter_team, rewarded) values (p_invitee, v_inviter, p_inviter_team, v_reward)
  on conflict (invitee) do nothing;
  if not found then return jsonb_build_object('rewarded', false, 'reason', 'exists'); end if;
  if v_reward then
    perform public.f_coins_add(v_inviter, v_rules.invite_bonus, 'invite', format('invite:%s', p_invitee), jsonb_build_object('invitee', p_invitee));
  end if;
  return jsonb_build_object('rewarded', v_reward, 'reason', case when v_reward then null else 'cap' end);
end $$;

-- Pakkatyypit ja arvontajoukon koko (aktiiviset pelaajat hintarajojen sisällä) pelipaikoittain
create or replace function public.f_pack_types(p_comp text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'price', t.price, 'cards', t.cards, 'min_price', t.min_price, 'max_price', t.max_price,
    'eligible', (select count(*) from public.fantasy_players p where p.comp = p_comp and p.active
                   and (t.min_price is null or p.price >= t.min_price) and (t.max_price is null or p.price < t.max_price)),
    'by_pos', (select coalesce(jsonb_object_agg(x.position, x.n), '{}'::jsonb) from (select p.position, count(*) as n from public.fantasy_players p
                 where p.comp = p_comp and p.active and (t.min_price is null or p.price >= t.min_price) and (t.max_price is null or p.price < t.max_price)
                 group by p.position) x)) order by t.sort), '[]'::jsonb)
  from public.fantasy_pack_types t where t.active
$$;

-- Arvontajoukko (pelaajatunnisteet) palvelimen arvontaa varten
create or replace function public.f_pack_pool(p_comp text, p_pack text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(p.player_id order by p.player_id), '[]'::jsonb)
  from public.fantasy_pack_types t join public.fantasy_players p on p.comp = p_comp and p.active
    and (t.min_price is null or p.price >= t.min_price) and (t.max_price is null or p.price < t.max_price)
  where t.id = p_pack and t.active
$$;

-- Yksi avaus kortteineen (myös historiaa ja uusintapyyntöä varten)
create or replace function public.f_pack_open_get(p_user bigint, p_open bigint) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', o.id, 'pack', o.pack, 'price', o.price, 'eligible', o.eligible, 'created_at', o.created_at, 'seen', o.seen_at is not null,
    'cards', coalesce((select jsonb_agg(jsonb_build_object('slot', c.slot, 'player_id', c.player_id, 'price', c.price, 'dup', c.dup,
        'name', p.name, 'team', p.team_name, 'team_id', p.team_id, 'logo', p.team_logo, 'pos', p.position, 'photo', p.photo, 'league', p.league) order by c.slot)
      from public.fantasy_cards c left join public.fantasy_players p on p.comp = c.comp and p.player_id = c.player_id where c.open_id = o.id), '[]'::jsonb))
  from public.fantasy_pack_opens o where o.id = p_open and o.user_id = p_user
$$;

-- Pakan avaus: tarkistukset, veloitus ja kortit samassa tapahtumassa.
-- p_players = palvelimen arpomat pelaajatunnisteet (pituus = pakan korttimäärä). Virheet: notype, cards, empty, stale, funds.
create or replace function public.f_pack_open(p_user bigint, p_comp text, p_pack text, p_request text, p_players jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_t record; v_open bigint; v_bal int; v_n int; v_pid int; v_slot int := 0; v_price numeric; v_ids int[] := '{}';
begin
  -- uusintapyyntö: palautetaan aiempi tulos veloittamatta
  select id into v_open from public.fantasy_pack_opens where user_id = p_user and request_id = p_request;
  if v_open is not null then return public.f_pack_open_get(p_user, v_open) || jsonb_build_object('replay', true); end if;
  select * into v_t from public.fantasy_pack_types where id = p_pack and active;
  if not found then return jsonb_build_object('error', 'notype'); end if;
  if jsonb_typeof(p_players) <> 'array' or jsonb_array_length(p_players) <> v_t.cards then return jsonb_build_object('error', 'cards'); end if;
  v_bal := public.f_coins_lock(p_user);
  -- sama pyyntö samanaikaisesti: toinen odotti lukossa → tarkistetaan uudelleen
  select id into v_open from public.fantasy_pack_opens where user_id = p_user and request_id = p_request;
  if v_open is not null then return public.f_pack_open_get(p_user, v_open) || jsonb_build_object('replay', true); end if;
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
  for v_pid in select (x)::int from jsonb_array_elements_text(p_players) x loop
    v_slot := v_slot + 1;
    select price into v_price from public.fantasy_players where comp = p_comp and player_id = v_pid;
    insert into public.fantasy_cards (user_id, open_id, slot, pack, comp, player_id, price, dup)
    values (p_user, v_open, v_slot, p_pack, p_comp, v_pid, v_price,
      v_pid = any(v_ids) or exists (select 1 from public.fantasy_cards c where c.user_id = p_user and c.comp = p_comp and c.player_id = v_pid and c.open_id <> v_open));
    v_ids := v_ids || v_pid;
  end loop;
  perform public.f_coins_add(p_user, -v_t.price, 'pack', format('pack:%s', v_open), jsonb_build_object('pack', p_pack, 'open', v_open));
  return public.f_pack_open_get(p_user, v_open) || jsonb_build_object('replay', false);
end $$;

create or replace function public.f_pack_seen(p_user bigint, p_open bigint) returns jsonb
language sql security definer set search_path = '' as $$
  update public.fantasy_pack_opens set seen_at = coalesce(seen_at, now()) where id = p_open and user_id = p_user
  returning jsonb_build_object('ok', true)
$$;

-- Lompakko: saldo, viimeisimmät kirjaukset ja avaukset (vain oma)
create or replace function public.f_wallet(p_user bigint) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'balance', coalesce((select balance from public.fantasy_wallets where user_id = p_user), 0),
    'rules', (select jsonb_build_object('start', start_bonus, 'participation', round_participation, 'per_point', round_per_point,
               'cap', round_point_cap, 'invite', invite_bonus, 'invite_daily', invite_daily_cap) from public.fantasy_coin_rules where id = 1),
    'ledger', coalesce((select jsonb_agg(jsonb_build_object('amount', amount, 'kind', kind, 'info', info, 'at', created_at) order by id desc)
               from (select * from public.fantasy_coin_ledger where user_id = p_user order by id desc limit 30) l), '[]'::jsonb),
    'opens', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'pack', o.pack, 'price', o.price, 'created_at', o.created_at, 'seen', o.seen_at is not null,
               'players', (select jsonb_agg(coalesce(p.name, '?') order by c.slot) from public.fantasy_cards c
                           left join public.fantasy_players p on p.comp = c.comp and p.player_id = c.player_id where c.open_id = o.id)) order by o.id desc)
               from (select * from public.fantasy_pack_opens where user_id = p_user order by id desc limit 10) o), '[]'::jsonb))
$$;

-- Kokoelma: pelaajittain (kappalemäärä, pakkatyypit), pelaajan nykyiset tiedot
create or replace function public.f_collection(p_user bigint, p_comp text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'cards', (select count(*) from public.fantasy_cards where user_id = p_user and comp = p_comp),
    'players', coalesce((select jsonb_agg(jsonb_build_object('player_id', x.player_id, 'count', x.n, 'packs', x.packs, 'first_at', x.first_at,
        'name', p.name, 'team', p.team_name, 'team_id', p.team_id, 'logo', p.team_logo, 'pos', p.position, 'price', p.price, 'photo', p.photo, 'league', p.league)
        order by p.price desc nulls last, p.name)
      from (select player_id, count(*) as n, jsonb_agg(distinct pack) as packs, min(created_at) as first_at
            from public.fantasy_cards where user_id = p_user and comp = p_comp group by player_id) x
      left join public.fantasy_players p on p.comp = p_comp and p.player_id = x.player_id), '[]'::jsonb))
$$;

do $$ declare f text; begin
  foreach f in array array[
    'f_coins_lock(bigint)','f_coins_add(bigint,integer,text,text,jsonb)','f_coins_settle(bigint,text)','f_coins_settle_comp(text)',
    'f_referral_record(bigint,bigint)','f_pack_types(text)','f_pack_pool(text,text)','f_pack_open_get(bigint,bigint)',
    'f_pack_open(bigint,text,text,text,jsonb)','f_pack_seen(bigint,bigint)','f_wallet(bigint)','f_collection(bigint,text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- Poisto: drop function public.f_coins_*, f_referral_record, f_pack_*, f_wallet, f_collection; drop table public.fantasy_cards,
-- public.fantasy_pack_opens, public.fantasy_pack_types, public.fantasy_referrals, public.fantasy_round_rewards,
-- public.fantasy_coin_ledger, public.fantasy_wallets, public.fantasy_coin_rules;
