#!/usr/bin/env bash
# Migraation tarkistus yhtä PostgreSQL-versiota vasten (Supabasen hostatut versiot ovat 15 ja 17).
# Käyttö: PG_URL=postgresql://postgres@127.0.0.1:5417/postgres bash sql-check.sh
set -uo pipefail
cd "$(dirname "$0")"
: "${PG_URL:?}"
q() { psql "$PG_URL" -v ON_ERROR_STOP=1 -qtAX -c "$1" 2>&1; }
ok() { echo "OK    $1"; }
bad() { echo "VIRHE $1 :: $2"; FAIL=1; }
FAIL=0
q "drop table if exists public.fd_quota_calls, public.fd_quota_state cascade; drop function if exists public.fd_quota_acquire(text,int,int,boolean,int); drop function if exists public.fd_quota_block(text,bigint,text);" >/dev/null
psql "$PG_URL" -qX -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;
-- kuten Supabasessa: uusille tauluille, funktioille ja sekvensseille oletusoikeudet anon/authenticated-rooleille
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
SQL
V=$(q "show server_version")
out=$(psql "$PG_URL" -qX -v ON_ERROR_STOP=1 -f ../../supabase/migrations/20261021_fd_quota.sql 2>&1) && ok "migraatio ajettu ($V)" || bad "migraatio" "$out"
out=$(psql "$PG_URL" -qX -v ON_ERROR_STOP=1 -f ../../supabase/migrations/20261021_fd_quota.sql 2>&1) && ok "migraatio uudelleen (idempotentti)" || bad "uudelleenajo" "$out"
for r in anon authenticated; do
  o=$(q "set role $r; select public.fd_quota_acquire('x',8,3,false,60000)"); grep -q "permission denied" <<<"$o" && ok "$r ei voi kutsua acquire" || bad "$r acquire" "$o"
  o=$(q "set role $r; select public.fd_quota_block('x',0,'x')"); grep -q "permission denied" <<<"$o" && ok "$r ei voi kutsua block" || bad "$r block" "$o"
  o=$(q "set role $r; select count(*) from public.fd_quota_calls"); grep -q "permission denied" <<<"$o" && ok "$r ei voi lukea fd_quota_calls" || bad "$r calls" "$o"
  o=$(q "set role $r; select count(*) from public.fd_quota_state"); grep -q "permission denied" <<<"$o" && ok "$r ei voi lukea fd_quota_state" || bad "$r state" "$o"
  o=$(q "set role $r; select nextval('public.fd_quota_calls_id_seq')"); grep -q "permission denied" <<<"$o" && ok "$r ei voi käyttää sekvenssiä" || bad "$r seq" "$o"
done
o=$(q "set role service_role; select public.fd_quota_acquire('t',8,3,false,60000)->>'ok'"); [ "$o" = "true" ] && ok "service_role voi varata" || bad "service_role" "$o"
o=$(q "select string_agg(proname||'='||array_to_string(proconfig,','),' ') from pg_proc where proname like 'fd_quota_%'")
grep -q "fd_quota_acquire=search_path=\"\"" <<<"$o" && grep -q "fd_quota_block=search_path=\"\"" <<<"$o" && ok "SECURITY DEFINER + tyhjä search_path" || bad "search_path" "$o"
o=$(q "select string_agg(proname||':'||prosecdef::text,' ') from pg_proc where proname like 'fd_quota_%'"); grep -qv false <<<"$o" && ok "molemmat SECURITY DEFINER" || bad "secdef" "$o"
# hakupolkukaappaus: haitallinen objekti toisessa skeemassa ei vaikuta
q "create schema if not exists evil; create table if not exists evil.fd_quota_calls(x int); grant usage on schema evil to service_role" >/dev/null
o=$(q "set role service_role; set search_path=evil,public; select public.fd_quota_acquire('t2',8,3,false,60000)->>'ok'"); [ "$o" = "true" ] && ok "search_path-kaappaus ei vaikuta" || bad "kaappaus" "$o"
q "drop schema evil cascade" >/dev/null
# atomisuus: 30 rinnakkaista erillistä yhteyttä, raja 8
q "delete from public.fd_quota_calls" >/dev/null
for i in $(seq 1 30); do (psql "$PG_URL" -qtAX -c "set role service_role; select public.fd_quota_acquire('par',8,3,false,60000)->>'ok'" > /tmp/par.$$.$i 2>&1 &) ; done
sleep 4; n=$(cat /tmp/par.$$.* | grep -c true); rm -f /tmp/par.$$.*
[ "$n" = "8" ] && ok "30 rinnakkaista yhteyttä → täsmälleen 8 varausta" || bad "atomisuus" "$n"
# matalan prioriteetin osaraja
q "delete from public.fd_quota_calls" >/dev/null
n=0; for i in $(seq 1 6); do o=$(q "set role service_role; select public.fd_quota_acquire('low',8,3,true,60000)->>'ok'"); [ "$o" = true ] && n=$((n+1)); done
o=$(q "set role service_role; select public.fd_quota_acquire('low',8,3,false,60000)->>'ok'")
[ "$n" = 3 ] && [ "$o" = true ] && ok "matala osaraja 3, korkea mahtuu silti" || bad "osaraja" "$n/$o"
# siivous: vanhat rivit muista ämpäreistä poistuvat
q "insert into public.fd_quota_calls(bucket,at) select 'vanha-'||g, now()-interval '2 hours' from generate_series(1,500) g" >/dev/null
q "set role service_role; select public.fd_quota_acquire('t3',8,3,false,60000)" >/dev/null
o=$(q "select count(*) from public.fd_quota_calls where bucket like 'vanha-%'"); [ "$o" = 0 ] && ok "yli tunnin vanhat rivit siivotaan (500 → 0)" || bad "siivous" "$o"
# tauko: yhteinen, ei lyhene, enintään 24 h
now=$(q "select (extract(epoch from now())*1000)::bigint")
q "set role service_role; select public.fd_quota_block('b',$((now+30000)),'429')" >/dev/null
q "set role service_role; select public.fd_quota_block('b',$((now+5000)),'429')" >/dev/null
o=$(q "set role service_role; select public.fd_quota_acquire('b',8,3,false,60000)->>'reason'"); w=$(q "set role service_role; select (public.fd_quota_acquire('b',8,3,false,60000)->>'wait_ms')::int > 20000")
[ "$o" = paused ] && [ "$w" = t ] && ok "yhteinen tauko voimassa eikä lyhene" || bad "tauko" "$o/$w"
q "set role service_role; select public.fd_quota_block('c',$((now+10*86400000)),'x')" >/dev/null
o=$(q "select blocked_until < now() + interval '24 hours 1 minute' from public.fd_quota_state where bucket='c'"); [ "$o" = t ] && ok "tauko rajattu 24 h:iin" || bad "24h" "$o"
o=$(q "set role service_role; select public.fd_quota_acquire(repeat('x',100),8,3,false,60000)"); grep -q "invalid quota arguments" <<<"$o" && ok "virheelliset argumentit hylätään" || bad "argumentit" "$o"
q "drop table if exists public.fd_quota_calls, public.fd_quota_state cascade" >/dev/null
[ $FAIL = 0 ] && echo "TULOS $V: OK" || echo "TULOS $V: VIRHE"
exit $FAIL
