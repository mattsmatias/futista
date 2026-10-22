#!/usr/bin/env bash
# Eristetty testiympäristö oikealla Supabase-ohjelmistolla (Supabase CLI:n paikallinen pino Dockerissa):
# PostgreSQL 17 + GoTrue (Auth) + PostgREST + Realtime + Kong + Mailpit (sieppaa sähköpostit; mitään ei lähde ulos).
# Futista ajetaan samassa koneessa tätä pinoa vasten. Jalkapallodata tulee simuloiduista lähteistä
# (tests/integration/mock-sources.cjs) → oikeaa football-dataa / ESPNiä ei kuormiteta.
# Käyttö (Ubuntu, root): bash tests/supabase-real/sandbox.sh [setup|app|test|ui]
set -euo pipefail
REPO=$(cd "$(dirname "$0")/../.." && pwd)
SB=/vercel/sb   # Supabase-projektin kansio (nimi "sb" -> säiliöt supabase_*_sb)
step=${1:-all}

setup() {
  command -v docker >/dev/null || { apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker.io postgresql-client >/dev/null; }
  docker info >/dev/null 2>&1 || { (dockerd > /tmp/dockerd.log 2>&1 &); for i in $(seq 30); do docker info >/dev/null 2>&1 && break; sleep 1; done; }
  mkdir -p $SB && cd $SB
  [ -d node_modules/supabase ] || npm i -s supabase@2 > /dev/null
  [ -f supabase/config.toml ] || npx supabase init --force > /dev/null
  # Auth: paluuosoitteet vain testisovellukseen (ja Preview-haaraan); sähköpostit Mailpitiin
  sed -i 's#^site_url = .*#site_url = "http://127.0.0.1:3000"#' supabase/config.toml
  sed -i 's#^additional_redirect_urls = .*#additional_redirect_urls = ["http://127.0.0.1:3000/livekatsomo/kirjaudu**", "https://futista-git-feature-livekatsomo-asunyt.vercel.app/livekatsomo/kirjaudu**"]#' supabase/config.toml
  npx supabase start -x studio,imgproxy,vector,logflare,storage-api,edge-runtime,postgres-meta,supavisor > /tmp/sbstart.log 2>&1 || { tail -30 /tmp/sbstart.log; exit 1; }
  npx supabase status -o env > $SB/status.env
  local PSQL="docker exec -i supabase_db_sb psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q"
  for f in 20261021_fd_quota 20261021_news_reactions 20261022_livekatsomo 20261022_livekatsomo; do $PSQL < "$REPO/supabase/migrations/$f.sql"; done  # viimeinen 2× = idempotenssi
  $PSQL < "$REPO/supabase/livekatsomo-ajastukset.sql" > /dev/null
  echo "supabase ok"
}

app() {
  set -a; . $SB/status.env; set +a
  cd "$REPO"
  [ -d node_modules/next ] || npm install --no-audit --no-fund > /tmp/npmci.log 2>&1
  (node tests/integration/mock-sources.cjs > /tmp/mock.log 2>&1 &)
  export LK_SUPABASE_URL="$API_URL" LK_SUPABASE_SECRET_KEY="$SECRET_KEY" SUPABASE_URL="$API_URL" SUPABASE_SERVICE_ROLE_KEY="$SECRET_KEY"
  export LK_REALTIME_URL="${LK_REALTIME_PUBLIC_URL:-$API_URL}" LK_REALTIME_KEY="$PUBLISHABLE_KEY" LIVEKATSOMO_ENABLED=1 LK_LOGIN=test LK_IP_SALT=$(openssl rand -hex 24) LK_SITE_URL=http://127.0.0.1:3000
  export FOOTBALL_DATA_KEY=test-not-a-real-key FD_BASE_URL=http://127.0.0.1:9101/v4 ESPN_BASE_URL=http://127.0.0.1:9101/espn/ FD_QUOTA_REQUIRED=1 NEXT_TELEMETRY_DISABLED=1
  export NEXT_PUBLIC_LIVEKATSOMO=1 NEXT_PUBLIC_LK_TESTDATA=1
  [ -f .next/BUILD_ID ] || npx next build > /tmp/build.log 2>&1 || { tail -30 /tmp/build.log; exit 1; }
  (setsid npx next start -p 3000 > /tmp/next.log 2>&1 &)
  for i in $(seq 60); do curl -sf -o /dev/null http://127.0.0.1:3000/tietoa && break; sleep 1; done
  echo "app ok"
}

test_() {
  set -a; . $SB/status.env; set +a
  cd "$REPO"
  SUPA_URL="$API_URL" SUPA_PUBLISHABLE="$PUBLISHABLE_KEY" SUPA_SECRET="$SECRET_KEY" APP=http://127.0.0.1:3000 MAILPIT="${MAILPIT_URL:-http://127.0.0.1:54324}" \
    PSQL="docker exec -i supabase_db_sb psql -U postgres -d postgres -qAt" OUT=/tmp/lk-real.json node tests/supabase-real/real.cjs
}

case $step in
  setup) setup ;; app) app ;; test) test_ ;;
  all) setup; app; test_ ;;
esac
