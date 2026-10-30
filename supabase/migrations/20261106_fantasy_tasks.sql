-- Futista Fantasy: kierrostehtävät (Futista-kolikoita) ja kausitavoitteet (rajattu joukkuebudjetin lisäys).
-- Aja 20261105_fantasy_prune.sql:n jälkeen. Idempotentti. Lisää vain uusia tauluja ja funktioita; nykyiset joukkueet,
-- valinnat, pisteet, ranking, kolikot ja pakat eivät muutu. Ilman tätä migraatiota sovellus toimii kuten ennen.
--
-- Säännöt
--  * Kierrostehtävät luodaan palvelimella kolmelle seuraavalle avoimelle kierrokselle (horizon) hyvissä ajoin ennen määräaikaa
--    (kaikille samat; tehtäväpankista kiertävästi). Kerran luotu kierroksen tehtävä ei muutu; pankin muutokset koskevat
--    myöhemmin luotavia kierroksia.
--  * Tehtävä maksetaan vain kerran: suoritus (fantasy_task_claims) ja kolikkokirjaus (ref task:<kilpailu>:<kierros>:<paikka>)
--    ovat yksilöllisiä; lompakko lukitaan ennen tarkistusta → uusinta- ja samanaikaiset pyynnöt eivät maksa kahdesti.
--  * Osallistuminen = joukkueella on kierroksen määräajalla otettu tilannekuva (kelvollinen joukkue tallennettuna ajoissa;
--    edellisen kierroksen joukkue siirtyy automaattisesti) ja kierros on lopullinen (status final, pisteet eivät alustavia).
--  * Osallistumis- ja kapteenitehtävä maksetaan, kun kierros on lopullinen (ei riipu otteludatasta).
--    Ottelutietoihin perustuvat tehtävät (pisteet, maalit, maalisyötöt) maksetaan vasta, kun kierros on vahvistettu:
--    lopullinen JA korjausaika (confirm_hours, oletus 96 h = päivityksen tilastokorjausten ikkuna) kierroksen viimeisestä
--    ottelusta on kulunut. Tulos lasketaan kerran ja tallennetaan perusteineen; myöhempi käsin tehty uudelleenlaskenta ei
--    muuta jo kirjattua tehtävää (ei takaisinperintää eikä uutta maksua).
--  * Joukkuebudjetti = kilpailun budjetti (100,0) + ansaitut kausitavoitteet, enintään budget_cap (102,0; check-ehto).
--    Budjettia ei voi ostaa kolikoilla eikä saada pakoista; sitä ei voi siirtää. Lisäys on pysyvä, eikä sitä vähennetä.
--  * Laskenta alkaa kierroksesta start_round (asetetaan, kun palvelin ensimmäisen kerran kutsuu f_tasks_ensure: ensimmäinen
--    avoin kierros). Aiempia kierroksia ei lasketa ilman ylläpidon erillistä päätöstä (f_tasks_start_set).

alter table public.fantasy_coin_ledger drop constraint if exists fantasy_coin_ledger_kind_check;
alter table public.fantasy_coin_ledger add constraint fantasy_coin_ledger_kind_check
  check (kind in ('start','invite','round','round_fix','round_waived','pack','rename','task'));

create table if not exists public.fantasy_task_config (
  comp          text primary key references public.fantasy_comps(id) on delete cascade,
  start_round   integer not null check (start_round > 0),
  budget_cap    numeric(5,1) not null default 102.0 check (budget_cap >= 0 and budget_cap <= 102.0),
  confirm_hours integer not null default 96 check (confirm_hours between 0 and 720),
  horizon       integer not null default 3 check (horizon between 1 and 60),  -- montako seuraavaa avointa kierrosta saa tehtävät etukäteen
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Kausitavoitteet: osallistu `rounds` lopulliseen kierrokseen → +bonus (M). Oletukset lisää f_tasks_ensure kilpailun
-- ensimmäisellä kerralla; muutettavissa SQL:llä ennen kuin kukaan on saavuttanut tavoitetta.
create table if not exists public.fantasy_budget_goals (
  comp    text not null references public.fantasy_comps(id) on delete cascade,
  id      text not null check (id ~ '^[a-z0-9_-]{1,30}$'),
  rounds  integer not null check (rounds > 0),
  bonus   numeric(3,1) not null check (bonus > 0 and bonus <= 2.0),
  primary key (comp, id)
);

create table if not exists public.fantasy_participation (
  user_id    bigint not null references public.fantasy_users(id) on delete cascade,
  comp       text not null,
  round_no   integer not null,
  team_id    bigint not null,
  counted_at timestamptz not null default now(),
  primary key (user_id, comp, round_no)
);

create table if not exists public.fantasy_budget_awards (
  user_id    bigint not null references public.fantasy_users(id) on delete cascade,
  comp       text not null,
  goal_id    text not null,
  need       integer not null,
  bonus      numeric(3,1) not null check (bonus >= 0),   -- 0 = katto oli jo täynnä
  rounds     integer not null,                          -- osallistumiset kirjaushetkellä
  created_at timestamptz not null default now(),
  primary key (user_id, comp, goal_id)
);

-- Tehtäväpankki. slot: 1 = kevyt osallistumistehtävä, 2 = toinen tehtävä, 3 = kierroksen pistetavoite.
create table if not exists public.fantasy_task_defs (
  id      text primary key check (id ~ '^[a-z0-9_-]{2,30}$'),
  kind    text not null check (kind in ('participate','captain','points','goals','assists')),
  slot    integer not null check (slot between 1 and 3),
  target  integer not null check (target >= 0),
  reward  integer not null check (reward between 0 and 500),
  title   text not null,
  help    text not null,
  active  boolean not null default true,
  sort    integer not null default 0
);
insert into public.fantasy_task_defs (id, kind, slot, target, reward, title, help, sort) values
  ('osallistu', 'participate', 1, 1, 25, 'Osallistu kierrokselle',
   'Joukkueessasi on kelvollinen 15 pelaajan kokoonpano kierroksen määräajalla. Aiemmin tallennettu joukkue kelpaa – sitä ei tarvitse muuttaa.', 1),
  ('kapteeni', 'captain', 2, 1, 25, 'Kapteeni valittuna',
   'Joukkueessasi on kapteeni kierroksen määräajalla. Aiemmin valittu kapteeni kelpaa – kapteenia ei tarvitse vaihtaa.', 1),
  ('maalit2', 'goals', 2, 2, 25, 'Maaleja kentältä',
   'Kentälle laskettujen 11 pelaajasi maalit kierroksella yhteensä vähintään 2 (automaattiset vaihdot mukaan lukien, penkki ei).', 2),
  ('syotot2', 'assists', 2, 2, 25, 'Syöttöjä kentältä',
   'Kentälle laskettujen 11 pelaajasi maalisyötöt kierroksella yhteensä vähintään 2 (automaattiset vaihdot mukaan lukien, penkki ei).', 3),
  ('pisteet40', 'points', 3, 40, 50, 'Kerää 40 pistettä',
   'Joukkueesi kierrospisteet siirtovähennysten jälkeen vähintään 40.', 1),
  ('pisteet50', 'points', 3, 50, 50, 'Kerää 50 pistettä',
   'Joukkueesi kierrospisteet siirtovähennysten jälkeen vähintään 50.', 2),
  ('pisteet60', 'points', 3, 60, 50, 'Kerää 60 pistettä',
   'Joukkueesi kierrospisteet siirtovähennysten jälkeen vähintään 60.', 3)
on conflict (id) do nothing;

-- Kierroksen tehtävät (kopio pankista luontihetkellä; ei muutu jälkikäteen)
create table if not exists public.fantasy_round_tasks (
  comp       text not null references public.fantasy_comps(id) on delete cascade,
  round_no   integer not null,
  slot       integer not null check (slot between 1 and 3),
  def_id     text not null,
  kind       text not null,
  target     integer not null,
  reward     integer not null,
  title      text not null,
  help       text not null,
  created_at timestamptz not null default now(),
  primary key (comp, round_no, slot)
);

-- Tehtävän ratkaisu käyttäjälle (kerran): suoritettu tai ei saavutettu, arvo ja peruste
create table if not exists public.fantasy_task_claims (
  user_id    bigint not null references public.fantasy_users(id) on delete cascade,
  comp       text not null,
  round_no   integer not null,
  slot       integer not null,
  team_id    bigint not null,
  def_id     text not null,
  kind       text not null,
  target     integer not null,
  value      integer not null,
  status     text not null check (status in ('done','failed')),
  reward     integer not null check (reward >= 0),     -- maksettu määrä (0, jos ei saavutettu)
  basis      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, comp, round_no, slot)
);

do $$ declare t text; begin
  foreach t in array array['fantasy_task_config','fantasy_budget_goals','fantasy_participation','fantasy_budget_awards',
    'fantasy_task_defs','fantasy_round_tasks','fantasy_task_claims'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

-- =====================================================================
-- Funktiot (vain service_role)
-- =====================================================================

-- Kierroksen tilastot kentälle lasketuista pelaajista (kerroin > 0) pisteiden erittelystä: maalit / maalisyötöt
create or replace function public.f_task_count(p_breakdown jsonb, p_item text) returns integer
language sql immutable set search_path = '' as $$
  select coalesce(sum((it->>'n')::int), 0)::int
  from jsonb_array_elements(case when jsonb_typeof(p_breakdown->'players') = 'array' then p_breakdown->'players' else '[]'::jsonb end) x
  cross join lateral jsonb_array_elements(case when jsonb_typeof(x->'items') = 'array' then x->'items' else '[]'::jsonb end) it
  where coalesce((x->>'mult')::int, 0) > 0 and it->>'k' = p_item
$$;

-- Kapteeni avauskokoonpanossa tilannekuvassa
create or replace function public.f_task_captain(p_picks jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(p_picks->'xi') = 'array' and (p_picks->>'captain') ~ '^\d+$'
    and (p_picks->'xi') @> to_jsonb((p_picks->>'captain')::bigint), false)
$$;

-- Asetukset + tehtävät avoimille kierroksille (idempotentti; kutsutaan päivityksessä ja tehtävänäkymässä)
create or replace function public.f_tasks_ensure(p_comp text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_start int; v_new int; v_r record; v_n1 int; v_n2 int; v_n3 int; v_i1 int; v_i2 int; v_i3 int; v_made int := 0;
begin
  if not exists (select 1 from public.fantasy_comps where id = p_comp) then return jsonb_build_object('error', 'comp'); end if;
  select coalesce(min(round_no), (select coalesce(max(round_no), 0) + 1 from public.fantasy_rounds where comp = p_comp))
    into v_start from public.fantasy_rounds where comp = p_comp and locked_at is null and deadline_at > now();
  insert into public.fantasy_task_config (comp, start_round) values (p_comp, v_start) on conflict (comp) do nothing;
  get diagnostics v_new = row_count;
  if v_new > 0 and not exists (select 1 from public.fantasy_budget_goals where comp = p_comp) then
    -- Kauden 2026–27 pelissä on käyttöönoton jälkeen enintään 29 kierrosta → 30 kierroksen tavoite ei olisi mahdollinen.
    insert into public.fantasy_budget_goals (comp, id, rounds, bonus) values
      (p_comp, 'k04', 4, 0.5), (p_comp, 'k08', 8, 0.5), (p_comp, 'k15', 15, 0.5), (p_comp, 'k22', 22, 0.5)
    on conflict do nothing;
  end if;
  select start_round into v_start from public.fantasy_task_config where comp = p_comp;
  select count(*) into v_n1 from public.fantasy_task_defs where active and slot = 1;
  select count(*) into v_n2 from public.fantasy_task_defs where active and slot = 2;
  select count(*) into v_n3 from public.fantasy_task_defs where active and slot = 3;
  for v_r in
    select r.round_no, (select count(*) from public.fantasy_rounds r2 where r2.comp = p_comp and r2.round_no < r.round_no)::int as k
    from public.fantasy_rounds r
    where r.comp = p_comp and r.locked_at is null and r.deadline_at > now() and r.round_no >= v_start
      and r.round_no in (select r3.round_no from public.fantasy_rounds r3 where r3.comp = p_comp and r3.locked_at is null and r3.deadline_at > now()
                         order by r3.round_no limit (select horizon from public.fantasy_task_config where comp = p_comp))
      and not exists (select 1 from public.fantasy_round_tasks t where t.comp = p_comp and t.round_no = r.round_no)
    order by r.round_no
  loop
    -- kierto: paikka 2 ja 3 eri tahdissa → yhdistelmät vaihtelevat (3 × 3 = 9 eri paria ennen toistoa)
    v_i1 := case when v_n1 > 0 then v_r.k % v_n1 end;
    v_i2 := case when v_n2 > 0 then v_r.k % v_n2 end;
    v_i3 := case when v_n3 > 0 then (v_r.k + v_r.k / greatest(v_n2, 1)) % v_n3 end;
    insert into public.fantasy_round_tasks (comp, round_no, slot, def_id, kind, target, reward, title, help)
    select p_comp, v_r.round_no, d.slot, d.id, d.kind, d.target, d.reward, d.title, d.help
    from (
      (select * from public.fantasy_task_defs where active and slot = 1 order by sort, id offset v_i1 limit 1)
      union all (select * from public.fantasy_task_defs where active and slot = 2 order by sort, id offset v_i2 limit 1)
      union all (select * from public.fantasy_task_defs where active and slot = 3 order by sort, id offset v_i3 limit 1)
    ) d
    on conflict (comp, round_no, slot) do nothing;
    v_made := v_made + 1;
  end loop;
  return jsonb_build_object('start_round', v_start, 'rounds', v_made);
end $$;

-- Joukkuebudjetti palvelimen laskemana: perus + ansaitut kausitavoitteet, enintään katto
create or replace function public.f_team_budget(p_comp text, p_user bigint) returns jsonb
language sql stable security definer set search_path = '' as $$
  with c as (select budget as base from public.fantasy_comps where id = p_comp),
       cfg as (select budget_cap from public.fantasy_task_config where comp = p_comp),
       a as (select coalesce(sum(bonus), 0) as bonus from public.fantasy_budget_awards where user_id = p_user and comp = p_comp)
  select jsonb_build_object('base', c.base, 'bonus', a.bonus,
    'cap', coalesce((select budget_cap from cfg), c.base),
    'total', least(coalesce((select budget_cap from cfg), c.base), c.base + a.bonus))
  from c, a
$$;

-- Käyttäjän osallistumisten, kausitavoitteiden ja tehtävien tasaus (idempotentti, voidaan kutsua milloin tahansa)
create or replace function public.f_tasks_settle(p_user bigint, p_comp text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_cfg record; v_base numeric; v_n int; v_g record; v_have numeric; v_add numeric; v_t record; v_val int; v_done boolean;
  v_id text; v_paid int := 0; v_label text;
begin
  select * into v_cfg from public.fantasy_task_config where comp = p_comp;
  if not found then return jsonb_build_object('ok', false, 'reason', 'nocfg'); end if;
  perform public.f_coins_lock(p_user);   -- sarjoittaa saman käyttäjän tasaukset (samanaikaiset pyynnöt odottavat)

  -- 1) osallistumiset: lopullinen kierros + määräajan tilannekuva + lopulliset pisteet
  insert into public.fantasy_participation (user_id, comp, round_no, team_id)
  select p_user, p_comp, r.round_no, t.id
  from public.fantasy_teams t
  join public.fantasy_rounds r on r.comp = t.comp and r.status = 'final' and r.round_no >= v_cfg.start_round
  join public.fantasy_gw_picks g on g.team_id = t.id and g.round_no = r.round_no
  join public.fantasy_round_points p on p.team_id = t.id and p.round_no = r.round_no and not p.provisional
  where t.user_id = p_user and t.comp = p_comp
  on conflict do nothing;
  select count(*) into v_n from public.fantasy_participation where user_id = p_user and comp = p_comp;

  -- 2) kausitavoitteet → budjetti (katto: budget_cap)
  select budget into v_base from public.fantasy_comps where id = p_comp;
  for v_g in
    select * from public.fantasy_budget_goals g where g.comp = p_comp and g.rounds <= v_n
      and not exists (select 1 from public.fantasy_budget_awards a where a.user_id = p_user and a.comp = p_comp and a.goal_id = g.id)
    order by g.rounds, g.id
  loop
    select coalesce(sum(bonus), 0) into v_have from public.fantasy_budget_awards where user_id = p_user and comp = p_comp;
    v_add := greatest(0, least(v_g.bonus, v_cfg.budget_cap - v_base - v_have));
    insert into public.fantasy_budget_awards (user_id, comp, goal_id, need, bonus, rounds)
    values (p_user, p_comp, v_g.id, v_g.rounds, v_add, v_n) on conflict do nothing;
  end loop;

  -- 3) kierrostehtävät
  for v_t in
    select rt.*, t.id as team_id, g.picks, p.total, p.breakdown, r.label,
      not exists (select 1 from public.fantasy_fixtures f where f.comp = p_comp and f.round_no = rt.round_no
                  and coalesce(f.kickoff, r.first_kickoff) > now() - make_interval(hours => v_cfg.confirm_hours)) as confirmed
    from public.fantasy_round_tasks rt
    join public.fantasy_rounds r on r.comp = rt.comp and r.round_no = rt.round_no and r.status = 'final'
    join public.fantasy_teams t on t.comp = rt.comp and t.user_id = p_user
    join public.fantasy_gw_picks g on g.team_id = t.id and g.round_no = rt.round_no
    join public.fantasy_round_points p on p.team_id = t.id and p.round_no = rt.round_no and not p.provisional
    where rt.comp = p_comp and rt.round_no >= v_cfg.start_round
      and not exists (select 1 from public.fantasy_task_claims c where c.user_id = p_user and c.comp = p_comp and c.round_no = rt.round_no and c.slot = rt.slot)
    order by rt.round_no, rt.slot
  loop
    if v_t.kind = 'participate' then v_val := 1;
    elsif v_t.kind = 'captain' then v_val := case when public.f_task_captain(v_t.picks) then 1 else 0 end;
    else
      if not v_t.confirmed then continue; end if;  -- ottelutiedot voivat vielä korjautua
      v_val := case v_t.kind when 'points' then v_t.total
                             when 'goals' then public.f_task_count(v_t.breakdown, 'goal')
                             when 'assists' then public.f_task_count(v_t.breakdown, 'assist') else 0 end;
    end if;
    v_done := v_val >= v_t.target;
    v_id := null;
    insert into public.fantasy_task_claims (user_id, comp, round_no, slot, team_id, def_id, kind, target, value, status, reward, basis)
    values (p_user, p_comp, v_t.round_no, v_t.slot, v_t.team_id, v_t.def_id, v_t.kind, v_t.target, v_val,
      case when v_done then 'done' else 'failed' end, case when v_done then v_t.reward else 0 end,
      jsonb_build_object('total', v_t.total, 'confirmed', v_t.confirmed, 'at', now()))
    on conflict do nothing returning def_id into v_id;
    if v_id is not null and v_done and v_t.reward > 0 then
      perform public.f_coins_add(p_user, v_t.reward, 'task', format('task:%s:%s:%s', p_comp, v_t.round_no, v_t.slot),
        jsonb_build_object('round', v_t.round_no, 'label', v_t.label, 'task', v_t.def_id, 'title', v_t.title, 'value', v_val, 'target', v_t.target));
      v_paid := v_paid + v_t.reward;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'participated', v_n, 'paid', v_paid);
end $$;

create or replace function public.f_tasks_settle_comp(p_comp text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_u bigint; v_n int := 0;
begin
  if not exists (select 1 from public.fantasy_task_config where comp = p_comp) then return jsonb_build_object('users', 0); end if;
  for v_u in select distinct t.user_id from public.fantasy_teams t where t.comp = p_comp and t.first_round is not null loop
    perform public.f_tasks_settle(v_u, p_comp);
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('users', v_n);
end $$;

-- Tehtävänäkymä (vain oma): budjetti, kausitavoitteet, seuraavan avoimen kierroksen ja viimeisimpien lukittujen
-- kierrosten tehtävät edistymisineen (vain tallennetusta datasta; avoimella kierroksella ei ottelutietoja)
create or replace function public.f_tasks_view(p_comp text, p_user bigint) returns jsonb
language sql stable security definer set search_path = '' as $$
  with cfg as (select * from public.fantasy_task_config where comp = p_comp),
       tm as (select * from public.fantasy_teams where comp = p_comp and user_id = p_user),
       nr as (select min(round_no) as n from public.fantasy_rounds where comp = p_comp and locked_at is null and deadline_at > now()),
       shown as (
         select r.* from public.fantasy_rounds r
         where r.comp = p_comp and exists (select 1 from public.fantasy_round_tasks t where t.comp = p_comp and t.round_no = r.round_no)
           and (r.round_no = (select n from nr)
                or r.round_no in (select r2.round_no from public.fantasy_rounds r2 where r2.comp = p_comp and r2.locked_at is not null
                                    and exists (select 1 from public.fantasy_round_tasks t2 where t2.comp = p_comp and t2.round_no = r2.round_no)
                                  order by r2.round_no desc limit 4))
       )
  select jsonb_build_object(
    'enabled', exists (select 1 from cfg),
    'start_round', (select start_round from cfg),
    'confirm_hours', (select confirm_hours from cfg),
    'budget', public.f_team_budget(p_comp, p_user),
    'participated', (select count(*) from public.fantasy_participation where user_id = p_user and comp = p_comp),
    'goals', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'rounds', g.rounds, 'bonus', g.bonus,
               'awarded', a.bonus, 'at', a.created_at) order by g.rounds, g.id)
             from public.fantasy_budget_goals g left join public.fantasy_budget_awards a on a.user_id = p_user and a.comp = p_comp and a.goal_id = g.id
             where g.comp = p_comp), '[]'::jsonb),
    'rounds', coalesce((select jsonb_agg(x.v order by x.round_no desc) from (
      select s.round_no, jsonb_build_object('round_no', s.round_no, 'label', s.label, 'deadline_at', s.deadline_at, 'locked', s.locked_at is not null,
        'status', s.status,
        'confirm_at', (select max(coalesce(f.kickoff, s.first_kickoff)) + make_interval(hours => (select confirm_hours from cfg))
                       from public.fantasy_fixtures f where f.comp = p_comp and f.round_no = s.round_no),
        'has_picks', exists (select 1 from public.fantasy_picks pk join tm on tm.id = pk.team_id
                             where pk.from_round <= s.round_no and jsonb_array_length(coalesce(pk.picks->'squad', '[]'::jsonb)) = 15),
        'captain', (select (pk.picks->>'captain') is not null from public.fantasy_picks pk join tm on tm.id = pk.team_id
                    where pk.from_round <= s.round_no order by pk.from_round desc limit 1),
        'joined', exists (select 1 from public.fantasy_gw_picks g join tm on tm.id = g.team_id where g.round_no = s.round_no),
        'points', (select jsonb_build_object('total', p.total, 'provisional', p.provisional,
                     'goals', public.f_task_count(p.breakdown, 'goal'), 'assists', public.f_task_count(p.breakdown, 'assist'))
                   from public.fantasy_round_points p join tm on tm.id = p.team_id where p.round_no = s.round_no),
        'tasks', (select jsonb_agg(jsonb_build_object('slot', t.slot, 'id', t.def_id, 'kind', t.kind, 'target', t.target, 'reward', t.reward,
                    'title', t.title, 'help', t.help,
                    'claim', (select jsonb_build_object('status', c.status, 'value', c.value, 'reward', c.reward, 'at', c.created_at)
                              from public.fantasy_task_claims c where c.user_id = p_user and c.comp = p_comp and c.round_no = t.round_no and c.slot = t.slot))
                    order by t.slot)
                  from public.fantasy_round_tasks t where t.comp = p_comp and t.round_no = s.round_no)) as v
      from shown s) x), '[]'::jsonb))
$$;

-- Säännöt-sivulle: asetukset, kausitavoitteet ja tehtäväpankki (sama lähde kuin palkinnoilla)
create or replace function public.f_tasks_rules(p_comp text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'config', (select jsonb_build_object('start_round', start_round, 'budget_cap', budget_cap, 'confirm_hours', confirm_hours) from public.fantasy_task_config where comp = p_comp),
    'base', (select budget from public.fantasy_comps where id = p_comp),
    'goals', coalesce((select jsonb_agg(jsonb_build_object('rounds', rounds, 'bonus', bonus) order by rounds, id) from public.fantasy_budget_goals where comp = p_comp), '[]'::jsonb),
    'defs', coalesce((select jsonb_agg(jsonb_build_object('slot', slot, 'title', title, 'help', help, 'reward', reward, 'kind', kind, 'target', target) order by slot, sort, id)
              from public.fantasy_task_defs where active), '[]'::jsonb))
$$;

-- Esikatselu (ylläpito): mitä aloituskierrosta edeltävistä lopullisista kierroksista olisi kertynyt. Ei maksa mitään.
-- Kolikkoarvio: kevyet tehtävät (osallistuminen + kapteeni) ja 50 pisteen tavoite oletuspalkkioin.
create or replace function public.f_tasks_backfill_preview(p_comp text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with cfg as (select * from public.fantasy_task_config where comp = p_comp),
       c as (select budget as base from public.fantasy_comps where id = p_comp),
       light as (select coalesce(sum(reward), 0) as v from public.fantasy_task_defs where id in ('osallistu', 'kapteeni')),
       pts as (select coalesce(max(reward), 0) as v, coalesce(max(target), 50) as t from public.fantasy_task_defs where id = 'pisteet50'),
       old as (
         select t.user_id, t.id as team_id, t.name, count(*)::int as rounds,
           count(*) filter (where p.total >= (select t from pts))::int as pts_hits
         from public.fantasy_teams t
         join public.fantasy_rounds r on r.comp = t.comp and r.status = 'final' and r.round_no < (select start_round from cfg)
         join public.fantasy_gw_picks g on g.team_id = t.id and g.round_no = r.round_no
         join public.fantasy_round_points p on p.team_id = t.id and p.round_no = r.round_no and not p.provisional
         where t.comp = p_comp group by t.user_id, t.id, t.name
       ),
       rows as (
         select o.*, least((select budget_cap from cfg) - (select base from c),
                  coalesce((select sum(g.bonus) from public.fantasy_budget_goals g where g.comp = p_comp and g.rounds <= o.rounds), 0)) as budget_bonus,
           o.rounds * (select v from light) as coins_light, o.pts_hits * (select v from pts) as coins_points
         from old o
       )
  select jsonb_build_object(
    'start_round', (select start_round from cfg),
    'old_final_rounds', (select count(*) from public.fantasy_rounds where comp = p_comp and status = 'final' and round_no < (select start_round from cfg)),
    'teams_total', (select count(*) from public.fantasy_teams where comp = p_comp and first_round is not null),
    'teams_with_old', (select count(*) from rows),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('team_id', team_id, 'name', name, 'rounds', rounds, 'budget_bonus', budget_bonus,
              'coins_light', coins_light, 'coins_points', coins_points) order by rounds desc, team_id) from rows), '[]'::jsonb),
    'paid', false)
$$;

-- Ylläpidon päätös: laskennan aloituskierros (esim. aiempien kierrosten huomioiminen). Ei maksa mitään itse;
-- seuraava tasaus kirjaa osallistumiset ja tavoitteet uuden rajan mukaan. Vanhoilla kierroksilla ei ole tehtäviä.
create or replace function public.f_tasks_start_set(p_comp text, p_round integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if p_round is null or p_round < 1 then return jsonb_build_object('error', 'round'); end if;
  update public.fantasy_task_config set start_round = p_round, updated_at = now() where comp = p_comp;
  if not found then return jsonb_build_object('error', 'nocfg'); end if;
  return jsonb_build_object('start_round', p_round);
end $$;

do $$ declare f text; begin
  foreach f in array array[
    'f_task_count(jsonb,text)','f_task_captain(jsonb)','f_tasks_ensure(text)','f_team_budget(text,bigint)','f_tasks_settle(bigint,text)',
    'f_tasks_settle_comp(text)','f_tasks_view(text,bigint)','f_tasks_rules(text)','f_tasks_backfill_preview(text)','f_tasks_start_set(text,integer)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- Poisto: drop function public.f_task_count, f_task_captain, f_tasks_* (myös f_tasks_rules), f_team_budget; drop table public.fantasy_task_claims,
-- public.fantasy_round_tasks, public.fantasy_task_defs, public.fantasy_budget_awards, public.fantasy_participation,
-- public.fantasy_budget_goals, public.fantasy_task_config; (kolikkokirjausten 'task'-rivit jäävät kirjanpitoon)
