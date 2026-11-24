#!/usr/bin/env bash
# Proves a backup can be restored: loads public.dump (and auth.dump, if present) into a throwaway Postgres
# on top of the Supabase stand-ins, then checks the key tables came back.
# Prints counts and error summaries only, never family data.
# Usage: scripts/restore-test.sh <folder with public.dump [auth.dump]>    (MIN_PERSONS=50 by default)
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=$(cd "$1" && pwd)
MIN_PERSONS=${MIN_PERSONS:-50}
BIN=$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)
DIR=$(mktemp -d)
PORT=${PORT:-54339}
AS=()
if [ "$(id -u)" = 0 ]; then   # Postgres refuses to run as root
  id pgrunner >/dev/null 2>&1 || useradd -M -r pgrunner
  chown pgrunner "$DIR"; chmod 755 "$DIR"; AS=(runuser -u pgrunner --)
fi
"${AS[@]}" "$BIN/initdb" -D "$DIR/db" -U postgres -A trust >/dev/null
"${AS[@]}" "$BIN/pg_ctl" -D "$DIR/db" -o "-p $PORT -k $DIR" -l "$DIR/log" -w start >/dev/null
trap '"${AS[@]}" "$BIN/pg_ctl" -D "$DIR/db" stop -m fast >/dev/null; rm -rf "$DIR"' EXIT
CONN=(-h "$DIR" -p "$PORT" -U postgres -d postgres)
PSQL=("$BIN/psql" "${CONN[@]}" -v ON_ERROR_STOP=1 -q -X)

"${PSQL[@]}" -o /dev/null -f tests/supabase_stubs.sql

# 1. Sign-in accounts: stage the auth tables as text, then put id + email into the stand-in auth.users
users=0
if [ -f "$SRC/auth.dump" ]; then
  "$BIN/pg_restore" --data-only -f "$DIR/auth.sql" "$SRC/auth.dump"
  python3 - "$DIR/auth.sql" "$DIR/auth_staged.sql" <<'PY'
import re, sys
src, out = sys.argv[1], sys.argv[2]
with open(src, encoding='utf-8') as f, open(out, 'w', encoding='utf-8') as o:
    o.write('create schema if not exists auth_stage;\n')
    copying = False
    for line in f:
        m = re.match(r'COPY auth\.(\w+) \((.*)\) FROM stdin;', line)
        if m:
            table, cols = m.group(1), [c.strip() for c in m.group(2).split(',')]
            o.write(f'create table auth_stage.{table} ({", ".join(c + " text" for c in cols)});\n')
            o.write(f'COPY auth_stage.{table} ({", ".join(cols)}) FROM stdin;\n')
            copying = True
            continue
        if copying:
            o.write(line)
            if line.rstrip('\n') == '\\.':
                copying = False
PY
  "${PSQL[@]}" -o /dev/null -f "$DIR/auth_staged.sql"
  "${PSQL[@]}" -o /dev/null -c "insert into auth.users (id, email) select id::uuid, email from auth_stage.users on conflict do nothing"
  users=$("${PSQL[@]}" -tAc "select count(*) from auth.users")
fi

# 2. The family database
set +e
"$BIN/pg_restore" --no-owner --no-privileges -d postgres -h "$DIR" -p "$PORT" -U postgres "$SRC/public.dump" 2>"$DIR/restore.err"
set -e
# error headlines only: CONTEXT/DETAIL/Command lines can contain row values, so they are never printed
# "schema public already exists" is expected (the empty database already has it)
grep -v 'schema "public" already exists' "$DIR/restore.err" > "$DIR/restore2.err" || true; mv "$DIR/restore2.err" "$DIR/restore.err"
grep '^pg_restore: error' "$DIR/restore.err" | sed -E 's/(ERROR: .{0,160}).*/\1/' | sort | uniq -c | head -20 > "$DIR/errors.txt" || true
errors=$(grep -c '^pg_restore: error' "$DIR/restore.err" || true)

count() { "${PSQL[@]}" -tAc "select count(*) from public.$1" 2>/dev/null || echo "missing"; }
declare -A N
for t in persons parent_links partnerships profile_fields consents policy_versions members invitations photos threads thread_posts dm_messages audit_log family_info; do
  N[$t]=$(count "$t")
done
tables=$("${PSQL[@]}" -tAc "select count(*) from pg_tables where schemaname='public'")
policies=$("${PSQL[@]}" -tAc "select count(*) from pg_policies where schemaname='public'")
rls_off=$("${PSQL[@]}" -tAc "select count(*) from pg_tables where schemaname='public' and not rowsecurity")
fks=$("${PSQL[@]}" -tAc "select count(*) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public' and c.contype='f'")
orphans=$("${PSQL[@]}" -tAc "select count(*) from public.members m where not exists (select 1 from auth.users u where u.id = m.user_id)" 2>/dev/null || echo "?")

report() {
  echo "## Backup restore test"
  echo
  echo "| What | Restored |"
  echo "|---|---|"
  echo "| Tables / row-level security policies / links between tables | $tables / $policies / $fks |"
  echo "| Tables without row-level security | $rls_off |"
  echo "| Sign-in accounts | $users |"
  for t in persons parent_links partnerships profile_fields consents policy_versions members invitations photos threads thread_posts dm_messages audit_log family_info; do
    echo "| $t | ${N[$t]} |"
  done
  echo "| Members whose sign-in account is missing | $orphans |"
  echo "| Restore errors | $errors |"
  if [ -s "$DIR/errors.txt" ]; then echo; echo '```'; cat "$DIR/errors.txt"; echo '```'; fi
}
report
[ -n "${GITHUB_STEP_SUMMARY:-}" ] && report >> "$GITHUB_STEP_SUMMARY"

fail=0
num() { [[ "$1" =~ ^[0-9]+$ ]]; }
for t in persons parent_links profile_fields consents policy_versions members family_info; do
  if ! num "${N[$t]}" || [ "${N[$t]}" -lt 1 ]; then echo "::error::$t did not come back"; fail=1; fi
done
if num "${N[persons]}" && [ "${N[persons]}" -lt "$MIN_PERSONS" ]; then echo "::error::only ${N[persons]} people restored (expected at least $MIN_PERSONS)"; fail=1; fi
if [ "$rls_off" != "0" ]; then echo "::error::$rls_off restored tables have row-level security off"; fail=1; fi
if [ -f "$SRC/auth.dump" ] && [ "$orphans" != "0" ]; then echo "::error::$orphans members have no sign-in account in the backup"; fail=1; fi
if [ "$fail" = 0 ]; then echo "Restore test passed."; fi
exit $fail
