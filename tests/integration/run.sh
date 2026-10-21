#!/usr/bin/env bash
# Paikallinen kokonaisketju: tuotantokäännös + simuloidut lähteet + Supabase-REST-emulaattori (PostgreSQL + migraatio).
# Ei yhteyttä oikeaan football-dataan, ESPN:ään, Supabaseen eikä tuotantoon. Ks. docs/testaus.md.
# Edellyttää: PostgreSQL (PG_URL, pääkäyttäjä, tyhjä testikanta), npm-paketit pg ja playwright-core (NODE_PATH),
#             Chromium (CHROME). Google Fonts ei ole tavoitettavissa suljetussa ympäristössä → FONTS_MOCK (valinnainen).
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${PG_URL:?}" "${CHROME:?}"
pids=()
cleanup() { for p in "${pids[@]}"; do kill -- "-$p" 2>/dev/null || kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT
psql "$PG_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public to service_role;
SQL
psql "$PG_URL" -v ON_ERROR_STOP=1 -q -f supabase/migrations/20261021_fd_quota.sql
psql "$PG_URL" -v ON_ERROR_STOP=1 -q -f supabase/migrations/20261021_news_reactions.sql
psql "$PG_URL" -v ON_ERROR_STOP=1 -q -f supabase/migrations/20261022_livekatsomo.sql
node tests/integration/mock-sources.cjs & pids+=($!)
PORT=9102 node tests/quota-mp/rest.cjs & pids+=($!)
node tests/integration/toggle-proxy.cjs & pids+=($!)
export FOOTBALL_DATA_KEY=test-not-a-real-key FD_BASE_URL=http://127.0.0.1:9101/v4 ESPN_BASE_URL=http://127.0.0.1:9101/espn/
export SUPABASE_URL=http://127.0.0.1:9102 SUPABASE_SERVICE_ROLE_KEY=sb_secret_localtest FD_QUOTA_REQUIRED=1 NEXT_TELEMETRY_DISABLED=1 LIVEKATSOMO_ENABLED=1 CRON_SECRET=test-cron-secret
[ -n "${FONTS_MOCK:-}" ] && export NEXT_FONT_GOOGLE_MOCKED_RESPONSES="$FONTS_MOCK"
# Livekatsomo käännökseen (selainosat) testiympäristössä; tuotannossa ei asetettu → ominaisuus pois
export NEXT_PUBLIC_LIVEKATSOMO=1 NEXT_PUBLIC_LK_TESTDATA=1
[ "${SKIP_BUILD:-}" = 1 ] || npx next build
rm -rf .next/cache/fetch-cache   # testit alkavat tyhjästä datavälimuistista
# palvelin omaan prosessiryhmäänsä, jotta pysäytys sulkee myös next-serverin
start() { setsid "$@" npx next start -p 3100 > /tmp/futista-it-server.log 2>&1 & srv=$!; pids+=($srv); for i in $(seq 40); do curl -sf -o /dev/null localhost:3100/tietoa && return; sleep 0.5; done; echo "palvelin ei käynnistynyt"; exit 1; }
start env
rc=0
node tests/integration/chain.cjs || rc=1
node tests/integration/ui.cjs || rc=1
node tests/integration/livekatsomo.cjs || rc=1
kill -- "-$srv"; for i in $(seq 40); do curl -s -o /dev/null localhost:3100/ || break; sleep 0.5; done
start env FD_OFF=1 ESPN_OFF=1 LIVEKATSOMO_ENABLED=0
node tests/integration/switches.cjs || rc=1
exit $rc
