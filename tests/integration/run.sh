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
# kohokohdat: vain taulu (ajastusosa vaatii Supabasen pg_cronin)
sed '/^-- AJASTUS/,$d' supabase/migrations/20261026_yt_videos.sql | psql "$PG_URL" -v ON_ERROR_STOP=1 -q
psql "$PG_URL" -v ON_ERROR_STOP=1 -q -f supabase/migrations/20261027_fantasy.sql
psql "$PG_URL" -v ON_ERROR_STOP=1 -q -f supabase/migrations/20261027b_fantasy_logo.sql
psql "$PG_URL" -v ON_ERROR_STOP=1 -q -f supabase/migrations/20261028_fantasy_multi.sql
psql "$PG_URL" -v ON_ERROR_STOP=1 -q -f supabase/migrations/20261029_site_stats.sql
psql "$PG_URL" -v ON_ERROR_STOP=1 -q -f supabase/migrations/20261030_fantasy_round_fixtures.sql
psql "$PG_URL" -v ON_ERROR_STOP=1 -q -f supabase/migrations/20261031_fantasy_coins_packs.sql
psql "$PG_URL" -v ON_ERROR_STOP=1 -q -f supabase/migrations/20261101_fantasy_card_versions.sql
psql "$PG_URL" -v ON_ERROR_STOP=1 -q -f supabase/migrations/20261102_ad_enquiries.sql
psql "$PG_URL" -v ON_ERROR_STOP=1 -q -f supabase/migrations/20261103_fantasy_rename.sql
psql "$PG_URL" -v ON_ERROR_STOP=1 -q -f supabase/migrations/20261104_fantasy_team_view.sql
psql "$PG_URL" -v ON_ERROR_STOP=1 -q -f supabase/migrations/20261105_fantasy_prune.sql
psql "$PG_URL" -v ON_ERROR_STOP=1 -q -f supabase/migrations/20261106_fantasy_tasks.sql
# luotettavuus: vain taulut ja funktiot (ajastusosa vaatii Supabasen pg_cronin ja pg_netin)
sed '/^-- AJASTUS/,$d' supabase/migrations/20261107_fantasy_reliability.sql | psql "$PG_URL" -v ON_ERROR_STOP=1 -q
node tests/integration/mock-sources.cjs & pids+=($!)
PORT=9102 node tests/quota-mp/rest.cjs & pids+=($!)
node tests/integration/toggle-proxy.cjs & pids+=($!)
export FOOTBALL_DATA_KEY=test-not-a-real-key FD_BASE_URL=http://127.0.0.1:9101/v4 ESPN_BASE_URL=http://127.0.0.1:9101/espn/
export SUPABASE_URL=http://127.0.0.1:9102 SUPABASE_SERVICE_ROLE_KEY=sb_secret_localtest FD_QUOTA_REQUIRED=1 NEXT_TELEMETRY_DISABLED=1
# siirrot: simuloitu API-Football (mock-sources.cjs /af/)
export APIFOOTBALL_KEY=test-not-a-real-key APIFOOTBALL_BASE_URL=http://127.0.0.1:9101/af
# muiden sarjojen ottelutiedot API-Footballista pois aiemmista testeistä (ne testaavat ESPN-lähdettä ja "ei käytössä" -tilaa); oma ajo lopussa
export AF_EXTRAS_OFF=1
# fantasy: yhden sarjan peli (Valioliiga, sarjakierrokset) koko ketjun testeissä; monisarjainen peli omalla palvelimella lopussa
export FANTASY_COMP=pl-2026
# hallintapaneeli: testin ylläpitäjätunnus (fantasy.cjs luo sen)
export FUTISTA_ADMINS=pelaaja_a
# kohokohdat: simuloitu YouTube (mock-sources.cjs /yt/, /ytimg/); ajastuksen tunniste testissä
export YT_BASE_URL=http://127.0.0.1:9101/yt YT_IMG_BASE_URL=http://127.0.0.1:9101/ytimg CRON_SECRET=test-cron-not-real
# pokaalit: simuloitu Wikidata (mock-sources.cjs /wd/sparql)
export WD_BASE_URL=http://127.0.0.1:9101/wd/sparql
# Mainosta-lomake: simuloitu Resend (mock-sources.cjs /resend/), testiosoitteet (example.test ei ole oikea verkkotunnus)
export RESEND_API_KEY=test-not-a-real-key RESEND_BASE_URL=http://127.0.0.1:9101/resend CONTACT_TO_EMAIL=yllapito@example.test CONTACT_FROM_EMAIL="Futista <lomake@example.test>"
[ -n "${FONTS_MOCK:-}" ] && export NEXT_FONT_GOOGLE_MOCKED_RESPONSES="$FONTS_MOCK"
[ "${SKIP_BUILD:-}" = 1 ] || npx next build
rm -rf .next/cache/fetch-cache   # testit alkavat tyhjästä datavälimuistista
# palvelin omaan prosessiryhmäänsä, jotta pysäytys sulkee myös next-serverin
start() { echo "=== palvelin: $* ===" >> "${SERVER_LOG:-/tmp/futista-it-server.log}"; setsid "$@" npx next start -p 3100 >> "${SERVER_LOG:-/tmp/futista-it-server.log}" 2>&1 & srv=$!; pids+=($srv); for i in $(seq 40); do curl -sf -o /dev/null localhost:3100/tietoa && return; sleep 0.5; done; echo "palvelin ei käynnistynyt"; exit 1; }
start env
rc=0
node tests/integration/chain.cjs || rc=1
node tests/integration/ui.cjs || rc=1
node tests/integration/af-kilpailut.cjs || rc=1
node tests/integration/pokaalit.cjs || rc=1
node tests/integration/punaiset.cjs || rc=1
node tests/integration/kohokohdat.cjs || rc=1
node tests/integration/fantasy.cjs || rc=1
node tests/integration/hallinta.cjs || rc=1
# Futista-kolikot, pakat ja kokoelma (fantasy.cjs:n tunnuksilla) sekä tietokantatason säännöt omalla testikilpailulla
node tests/integration/packs.cjs || rc=1
node tests/integration/rename.cjs || rc=1
node tests/integration/teamview.cjs || rc=1
node tests/integration/formation.cjs || rc=1
node tests/integration/reliability.cjs || rc=1
node tests/integration/lock-db.cjs || rc=1
node tests/integration/tasks.cjs || rc=1
node tests/integration/tasks-db.cjs || rc=1
node tests/integration/coins-db.cjs || rc=1
node tests/integration/versions-db.cjs || rc=1
kill -- "-$srv"; for i in $(seq 40); do curl -s -o /dev/null localhost:3100/ || break; sleep 0.5; done
# viikkoraja 3 päivää ennen tätä päivää (Helsinki): simuloidut ottelut (nyt −7 vrk … nyt +8 vrk) eivät osu rajalle ajankohdasta riippuen
start env FANTASY_COMP=top5f-2026 FANTASY_TEST_ANCHOR="$(TZ=Europe/Helsinki date -d "-73 days" +%F)"
node tests/integration/fantasy-multi.cjs || rc=1
kill -- "-$srv"; for i in $(seq 40); do curl -s -o /dev/null localhost:3100/ || break; sleep 0.5; done
start env FD_OFF=1 ESPN_OFF=1 RESEND_API_KEY=
node tests/integration/switches.cjs || rc=1
MAINOSTA_MODE=off node tests/integration/mainosta.cjs || rc=1
kill -- "-$srv"; for i in $(seq 40); do curl -s -o /dev/null localhost:3100/ || break; sleep 0.5; done
# mainoskortti ja Mainosta-sivu: simuloitu uutissyöte (muut testit ajetaan ilman uutisia)
start env NEWS_FEED_BASE_URL=http://127.0.0.1:9101/feed
node tests/integration/mainosta.cjs || rc=1
kill -- "-$srv"; for i in $(seq 40); do curl -s -o /dev/null localhost:3100/ || break; sleep 0.5; done
start env AF_EXTRAS_OFF=
node tests/integration/af-isot.cjs || rc=1
exit $rc
