#!/usr/bin/env bash
# Monen prosessin kiintiötesti oikeaa PostgreSQL:ää vasten. Ei ota yhteyttä oikeaan football-dataan eikä tuotannon Supabaseen.
# Edellyttää: PostgreSQL (PG_URL, superuser), npm-paketti pg, käännetyt lähteet (BUILD=.test-build)
set -euo pipefail
cd "$(dirname "$0")"
: "${PG_URL:?}" "${BUILD:?}"
export WINDOW_MS=2000
psql "$PG_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
drop table if exists public.fd_quota_calls, public.fd_quota_state cascade;
SQL
psql "$PG_URL" -v ON_ERROR_STOP=1 -q -f ../../supabase/migrations/20261021_fd_quota.sql
psql "$PG_URL" -q -c "grant usage on schema public to service_role;"
# oikeustarkistus: anon EI saa kutsua funktiota eikä lukea taulua
out=$(psql "$PG_URL" -q -c "set role anon; select public.fd_quota_acquire('x',1,1,false,60000);" 2>&1 || true)
if grep -q "permission denied" <<<"$out"; then echo "OIKEUDET: anon ei voi kutsua fd_quota_acquire  OK"; else echo "OIKEUDET: anon pääsi kutsumaan  VIRHE"; exit 1; fi
out=$(psql "$PG_URL" -q -c "set role anon; select * from public.fd_quota_calls;" 2>&1 || true)
if grep -q "permission denied" <<<"$out"; then echo "OIKEUDET: anon ei voi lukea fd_quota_calls  OK"; else echo "OIKEUDET: anon luki taulun  VIRHE"; exit 1; fi
out=$(psql "$PG_URL" -q -c "set role authenticated; select public.fd_quota_block('x',0,'x');" 2>&1 || true)
if grep -q "permission denied" <<<"$out"; then echo "OIKEUDET: authenticated ei voi kutsua fd_quota_block  OK"; else echo "OIKEUDET: authenticated pääsi kutsumaan  VIRHE"; exit 1; fi

PORT=4001 node mock-fd.cjs & P1=$!
rm -f trace.log; export TRACE=$PWD/trace.log
PORT=4002 node rest.cjs & P2=$!
PORT=4003 node rest.cjs & P3=$!
trap 'kill $P1 $P2 $P3 2>/dev/null' EXIT
sleep 1.5
export FD_URL=http://127.0.0.1:4001

if [ "${ONLY:-}" != "C" ]; then
echo "== A: 8 erillistä prosessia (4 'tuotanto' + 4 'esikatselu', sama avain) + 3 prosessia toisella avaimella, 10 s, 12 eri kohdetta =="
curl -s localhost:4001/__reset >/dev/null
( for i in 1 2 3 4; do WORKER="prod-w$i" FD_KEY=keyA DURATION=10000 REST_URL=http://127.0.0.1:4002 node worker.cjs & done
  for i in 1 2 3 4; do WORKER="preview-w$i" FD_KEY=keyA DURATION=10000 REST_URL=http://127.0.0.1:4003 node worker.cjs & done
  for i in 1 2 3; do WORKER="other-w$i" FD_KEY=keyB DURATION=10000 REST_URL=http://127.0.0.1:4002 node worker.cjs & done
  wait ) > A.workers.txt
curl -s localhost:4001/__stats > A.log.json
cat A.workers.txt; echo "LÄHDE (raja 8 / 2 s, matala 3 / 2 s):"; node check.cjs A.log.json | tee A.check.json
node -e 'const r=require("./A.check.json"); const bad=Object.entries(r).filter(([k,v])=>v.maxInAnyWindow>8||v.maxLowInAnyWindow>3||v.http429>0);
console.log(bad.length?"A: yhteinen raja  VIRHE "+JSON.stringify(bad):"A: yhteinen raja pitää kaikilla avaimilla (≤8 / ikkuna, matala ≤3, ei 429)  OK"); process.exit(bad.length?1:0)' 

echo "== B: 429 + Retry-After: 5 yhdelle prosessille → kaikki 6 prosessia pysähtyvät =="
curl -s localhost:4001/__reset >/dev/null
sleep 2.2
curl -s "localhost:4001/__force429?ra=5" >/dev/null
( for i in 1 2 3 4 5 6; do WORKER="b-w$i" FD_KEY=keyC DURATION=9000 REST_URL=http://127.0.0.1:$((4002 + i % 2)) node worker.cjs & done; wait ) > B.workers.txt
curl -s localhost:4001/__stats > B.log.json
node -e '
const L=require("./B.log.json").sort((a,b)=>a.t-b.t); const i=L.findIndex(e=>e.status===429);
if(i<0){console.log("B: 429 ei syntynyt  VIRHE");process.exit(1)}
const t0=L[i].t; const during=L.filter(e=>e.t>t0+150&&e.t<t0+5000); const after=L.filter(e=>e.t>=t0+5000);
const workers=new Set(L.filter(e=>e.t<t0+5000).map(e=>e.worker));
console.log(JSON.stringify({first429_by:L[i].worker, requestsBefore429:i, requestsDuringPause_after150ms:during.length, requestsAfterPause:after.length, http429total:L.filter(e=>e.status===429).length}));
console.log(during.length===0&&after.length>0?"B: yhteinen tauko  OK":"B: yhteinen tauko  VIRHE");'

fi
echo "== C: kiintiövaraston häiriö 3 s → ei yhtään lähdehakua häiriön aikana =="
curl -s localhost:4001/__reset >/dev/null
( for i in 1 2 3 4; do WORKER="c-w$i" FD_KEY=keyD DURATION=7000 REST_URL=http://127.0.0.1:$((4002 + i % 2)) node worker.cjs & done
  sleep 2; curl -s localhost:4002/__down >/dev/null; curl -s localhost:4003/__down >/dev/null; date +%s%3N > C.down
  sleep 3; date +%s%3N > C.up; curl -s localhost:4002/__up >/dev/null; curl -s localhost:4003/__up >/dev/null; wait ) > C.workers.txt
curl -s localhost:4001/__stats > C.log.json
node -e '
const L=require("./C.log.json"); const d=+require("fs").readFileSync("C.down","utf8"), u=+require("fs").readFileSync("C.up","utf8");
const during=L.filter(e=>e.t>d+200&&e.t<u); const before=L.filter(e=>e.t<d), after=L.filter(e=>e.t>u);
const T=require("fs").readFileSync(process.env.TRACE,"utf8").trim().split("\n").map(l=>l.split(" ")).filter(x=>+x[0]>=d&&+x[0]<u&&/"ok":true/.test(x.slice(2).join(" ")));
const w=require("fs").readFileSync("C.workers.txt","utf8").trim().split("\n").map(JSON.parse);
console.log(JSON.stringify({before:before.length, duringOutage:during.length, grantsDuringOutage:T.length, after:after.length, quotaErrors:w.reduce((s,x)=>s+x.quota,0)}));
console.log(during.length===0&&T.length===0&&after.length>0&&before.length>0?"C: fail closed  OK":"C: fail closed  VIRHE");'

echo "== D: Supabase-otsakesääntö: Bearer sb_secret_ hylätään, apikey-otsake hyväksytään =="
curl -s -o /dev/null -w "Bearer sb_secret_: %{http_code}\n" -X POST localhost:4002/rest/v1/rpc/fd_quota_acquire -H "apikey: sb_secret_x" -H "Authorization: Bearer sb_secret_x" -H "content-type: application/json" -d '{"p_bucket":"d","p_limit":8,"p_low_limit":3,"p_low":false,"p_window_ms":2000}'
curl -s -w "  apikey only: %{http_code}\n" -X POST localhost:4002/rest/v1/rpc/fd_quota_acquire -H "apikey: sb_secret_x" -H "content-type: application/json" -d '{"p_bucket":"d","p_limit":8,"p_low_limit":3,"p_low":false,"p_window_ms":2000}'
