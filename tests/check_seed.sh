#!/usr/bin/env bash
# Loads data/seed.sql into a throwaway database (after the migrations) and prints counts.
set -euo pipefail
cd "$(dirname "$0")/.."
BIN=$(ls -d /usr/lib/postgresql/*/bin | tail -1); DIR=$(mktemp -d); PORT=54330; AS=()
if [ "$(id -u)" = 0 ]; then id pgrunner >/dev/null 2>&1 || useradd -M -r pgrunner; chown pgrunner "$DIR"; chmod 755 "$DIR"; AS=(runuser -u pgrunner --); fi
"${AS[@]}" "$BIN/initdb" -D "$DIR/db" -U postgres -A trust >/dev/null
"${AS[@]}" "$BIN/pg_ctl" -D "$DIR/db" -o "-p $PORT -k $DIR" -l "$DIR/log" -w start >/dev/null
trap '"${AS[@]}" "$BIN/pg_ctl" -D "$DIR/db" stop -m fast >/dev/null; rm -rf "$DIR"' EXIT
P=(psql -h "$DIR" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${P[@]}" -o /dev/null -f tests/supabase_stubs.sql
for f in supabase/migrations/*.sql; do "${P[@]}" -o /dev/null -f "$f"; done
"${P[@]}" -o /dev/null -f data/seed.sql
"${P[@]}" -c "select (select count(*) from persons) people, (select count(*) from persons where not is_living) late, (select count(*) from parent_links) links, (select count(*) from partnerships) partners, (select count(*) from profile_fields) details, (select count(*) from persons where is_minor(id)) minors"
"${P[@]}" -c "select field, visibility, count(*) from profile_fields group by 1,2 order by 1"
"${P[@]}" -c "select count(*) filter (where role = 'admin' and approved_at is not null) first_admin_invitation from invitations"
# with templates/sample-family.xlsx: Arjun (P005) is close to his wife, father, sister and sister's husband
"${P[@]}" -c "select is_close('P005','P006') wife, is_close('P005','P003') father, is_close('P005','P011') sister, is_close('P005','P012') sisters_husband" 2>/dev/null || true
