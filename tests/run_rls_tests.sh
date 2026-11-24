#!/usr/bin/env bash
# Spins up a throwaway Postgres, applies the migrations on top of Supabase stand-ins,
# and runs the privacy tests. Usage: tests/run_rls_tests.sh
set -euo pipefail
cd "$(dirname "$0")/.."
BIN=$(ls -d /usr/lib/postgresql/*/bin | tail -1)
DIR=$(mktemp -d)
PORT=${PORT:-54329}
AS=()
if [ "$(id -u)" = 0 ]; then   # Postgres refuses to run as root
  id pgrunner >/dev/null 2>&1 || useradd -M -r pgrunner
  chown pgrunner "$DIR"; chmod 755 "$DIR"; AS=(runuser -u pgrunner --)
fi
"${AS[@]}" "$BIN/initdb" -D "$DIR/db" -U postgres -A trust >/dev/null
"${AS[@]}" "$BIN/pg_ctl" -D "$DIR/db" -o "-p $PORT -k $DIR" -l "$DIR/log" -w start >/dev/null
trap '"${AS[@]}" "$BIN/pg_ctl" -D "$DIR/db" stop -m fast >/dev/null; rm -rf "$DIR"' EXIT
PSQL=(psql -h "$DIR" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -o /dev/null)
"${PSQL[@]}" -f tests/supabase_stubs.sql
for f in supabase/migrations/*.sql; do "${PSQL[@]}" -f "$f"; done
"${PSQL[@]}" -f tests/rls_test.sql 2>&1 | sed -E "s/^psql:[^ ]+ (NOTICE|ERROR):  /  /"
