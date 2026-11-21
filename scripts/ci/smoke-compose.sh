#!/bin/sh
# ============================================================
# Boot test of the whole production stack (compose.production.yml) with already-built
# images. Run by the CI `images` job and by `make prod-smoke`.
#
# Usage: scripts/ci/smoke-compose.sh [env-file] [project]
#        (defaults: scripts/ci/compose-smoke.env brewform-ci)
# The env file selects the images (API_IMAGE, WEB_IMAGE, IMAGE_TAG; the default file uses
# brewform-api:ci / brewform-web:ci) and the host port of the web edge (WEB_PORT). Values
# in the calling environment win over the file, so `make prod-smoke` runs it with
# IMAGE_TAG=local.
#
# Checks, in order:
#   1. `up -d`, then poll `ps` until postgres, valkey, api, web and backup are healthy and
#      migrate exited 0 (fails after 300 s); the backup's start-up dump already holds the
#      migrated schema (backup starts only after migrate completed). The production seed
#      created exactly one user (the admin) and no @example.com account; the migrate log
#      shows the comment-count recount (`Recounting comment counts...`, then
#      `Comment count recount: complete (scanned 0, repaired 0, skipped 0)`), and a second
#      `run --rm migrate` exits 0 and logs `repaired 0`.
#   2. Through the web port: /healthz is 200 and /health is {"status":"ok"}; inside the api
#      container `node /app/healthcheck.mjs /ready` exits 0.
#   3. A 1x1 PNG written to /app/uploads as `node` survives `up -d --force-recreate api`
#      and is served as image/png at /uploads/ci-probe.png through the web edge.
#   4. While a 64 MiB file in /app/uploads keeps growing (a self-stopping appender), a
#      one-shot backup (BACKUP_ONESHOT=1, --no-deps like `make prod-backup`) exits 0 and logs
#      `uploads changed while archiving`; it leaves a db-*.dump that `pg_restore --list`
#      reads and an uploads-*.tar.gz that lists ci-probe.png, and keeps a dump planted with a
#      1970 mtime (one-shot runs never prune).
#   5. Restore onto a newer schema: after a table with foreign keys to `user` and `recipe`
#      (the shape that broke the old in-place restore) and a user row were added and the
#      probe was deleted, the real `make prod-restore DUMP=<step 4 dump> UPLOADS=<archive>`
#      (this env file and project) exits 0; the stack becomes healthy again, the table and
#      the row are gone, the migration count equals the journal, the probe is served, and a
#      db-*.dump lists the added table (only the safety backup can hold it). The planted
#      1970 dump survived the safety backup and was pruned by the backup service's scheduled
#      start-up run (its log names it).
#   6. Restore an older dump: a scratch database `ci_old` migrated with the newest journal
#      entry removed is dumped by the backup service and restored with `make prod-restore`;
#      `migrate` then applies the missing migration (count equals the journal) and seeds the
#      empty restored database in production mode (one user).
#   7. `stop api` exits 0 and the api logs `Graceful shutdown complete`.
# A trap prints `docker compose logs` on failure and always runs `down -v`.
# Prints one `ok`/`not ok` line per check and exits 1 on the first failure.
# Requires: docker (compose v2), curl, jq, GNU make.
# ============================================================
set -eu

cd "$(dirname "$0")/../.."
ENV_FILE=${1:-scripts/ci/compose-smoke.env}
PROJECT=${2:-brewform-ci}
TIMEOUT=300
PNG_BASE64=iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==
# A dump planted with a 1970 mtime (older than any BACKUP_RETENTION_DAYS).
OLD_DUMP=db-20200101T000000Z.dump
TMP=$(mktemp -d)

# The smoke test always uses the default named volumes; never inherit data sources or a
# project/profile selection from the caller.
unset UPLOADS_SOURCE POSTGRES_DATA_SOURCE BACKUPS_SOURCE COMPOSE_PROFILES \
	COMPOSE_PROJECT_NAME COMPOSE_FILE 2>/dev/null || true

# Run docker compose for this project, env file and the production compose file.
dc() {
	docker compose -p "$PROJECT" --env-file "$ENV_FILE" -f compose.production.yml "$@"
}

# Record a passing check.
ok() {
	echo "ok - $*"
}

# Fail the run (the EXIT trap prints the logs and tears the stack down).
die() {
	echo "not ok - $*" >&2
	exit 1
}

# EXIT trap: compose logs on failure, then always `down -v`, keeping the exit status.
on_exit() {
	status=$?
	if [ "$status" -ne 0 ]; then
		echo "# smoke-compose failed; docker compose logs follow" >&2
		dc ps -a >&2 2>&1 || true
		dc logs --no-color --tail 300 >&2 2>&1 || true
	fi
	dc down -v --remove-orphans >/dev/null 2>&1 || true
	rm -rf "$TMP"
	exit "$status"
}
trap on_exit EXIT
trap 'exit 130' INT TERM

# Run the SQL on stdin with psql inside the postgres container, against the database $DB
# (default: POSTGRES_DB), printing bare unaligned rows. The credentials come from the
# container's environment, so no password reaches a command line.
sql() {
	# The script runs inside the postgres container, so its variables must not expand here.
	# shellcheck disable=SC2016
	dc exec -T -e DB="${DB:-}" postgres sh -c \
		'exec psql -X -q -tA -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "${DB:-$POSTGRES_DB}"'
}

# Print `ps -a` as one JSON array (compose prints JSON Lines; older versions an array).
ps_json() {
	dc ps -a --format json | jq -s 'flatten'
}

# Poll until every service in $1 (space separated) is healthy and, when $2 is "migrate",
# the migrate one-shot exited 0; fails after TIMEOUT seconds or when a container exits
# non-zero.
wait_stack() {
	i=0
	while [ "$i" -lt "$TIMEOUT" ]; do
		ps_json >"$TMP/ps.json"
		if jq -e '[.[] | select(.State == "exited" and .ExitCode != 0)] | length > 0' \
			"$TMP/ps.json" >/dev/null; then
			die "a container exited non-zero: $(jq -c '[.[] | select(.ExitCode != 0)
				| {Service, State, ExitCode}]' "$TMP/ps.json")"
		fi
		ready=true
		for svc in $1; do
			if ! jq -e --arg s "$svc" '[.[] | select(.Service == $s and .Health == "healthy")]
				| length == 1' "$TMP/ps.json" >/dev/null; then
				ready=false
			fi
		done
		if [ "$2" = "migrate" ] && ! jq -e '[.[] | select(.Service == "migrate"
			and .State == "exited" and .ExitCode == 0)] | length == 1' "$TMP/ps.json" >/dev/null; then
			ready=false
		fi
		if [ "$ready" = true ]; then
			ok "healthy: $1${2:+ (and $2 exited 0)} after ${i}s"
			return 0
		fi
		i=$((i + 2))
		sleep 2
	done
	die "not healthy within ${TIMEOUT}s: $(jq -c '[.[] | {Service, State, Health, ExitCode}]' \
		"$TMP/ps.json")"
}

echo "# 1. start the stack ($PROJECT, $ENV_FILE)"
dc config --quiet
dc up -d
wait_stack "postgres valkey api web backup" migrate
# The script runs inside the backup container, so its variables must not expand here.
# shellcheck disable=SC2016
dc exec -T backup sh -euc '
	first=$(ls -tr /backups/db-*.dump | head -n 1)
	pg_restore --list "$first" | grep -q " TABLE public user "
	echo "$first holds the user table"
' || die "the backup start-up dump does not hold the migrated schema (backup ran before migrate)"
ok "backup: the start-up dump holds the migrated schema"
users=$(echo 'select count(*) from "user";' | sql) || die "counting users failed"
[ "$users" = "1" ] || die "the production seed created $users users (expected 1: the admin)"
ok "the production seed created exactly one user (the admin)"
demo=$(echo "select count(*) from \"user\" where email like '%@example.com';" | sql) ||
	die "counting @example.com users failed"
[ "$demo" = "0" ] || die "the production seed created $demo @example.com demo accounts"
ok "no @example.com demo account exists"
migrate_log=$(dc logs --no-color migrate)
case "$migrate_log" in
*'Recounting comment counts...'*) ok "the migrate log shows the comment-count recount step" ;;
*) die "the migrate log has no 'Recounting comment counts...' line: $migrate_log" ;;
esac
case "$migrate_log" in
*'Comment count recount: complete (scanned 0, repaired 0, skipped 0)'*)
	ok "the recount of a fresh install scanned 0, repaired 0, skipped 0"
	;;
*) die "the migrate log has no 'Comment count recount: complete (scanned 0, repaired 0, skipped 0)' line" ;;
esac
out=$(dc run --rm -T migrate 2>&1) || die "a second migrate run exited non-zero: $out"
case "$out" in
*'Comment count recount: complete'*'repaired 0'*) ok "a second migrate run exits 0 and logs repaired 0" ;;
*) die "a second migrate run did not log 'repaired 0': $out" ;;
esac
WEB_PORT=$(dc port web 80 | head -n 1 | sed 's/.*://')
[ -n "$WEB_PORT" ] || die "the web service publishes no host port"
WEB="http://127.0.0.1:$WEB_PORT"

echo "# 2. health endpoints"
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$WEB/healthz" || true)
[ "$code" = "200" ] || die "GET /healthz through the web port returned $code"
ok "GET /healthz through the web port returns 200"
body=$(curl -s --max-time 10 "$WEB/health" || true)
printf '%s' "$body" | jq -e '. == {"status": "ok"}' >/dev/null 2>&1 ||
	die "GET /health through the web port returned: $body"
ok 'GET /health through the web port returns {"status":"ok"}'
dc exec -T api node /app/healthcheck.mjs /ready || die "node /app/healthcheck.mjs /ready failed"
ok "node /app/healthcheck.mjs /ready exits 0 inside the api container"

echo "# 3. uploads survive an api recreate"
dc exec -T -u node api node -e \
	"require('node:fs').writeFileSync('/app/uploads/ci-probe.png', Buffer.from('$PNG_BASE64','base64'))"
ok "wrote /app/uploads/ci-probe.png as node"
dc up -d --force-recreate api
wait_stack "api" ""
headers=$(curl -s --max-time 10 -D - -o "$TMP/probe.png" "$WEB/uploads/ci-probe.png" || true)
case "$(printf '%s' "$headers" | head -n 1)" in
*" 200"*) ok "GET /uploads/ci-probe.png through the web edge returns 200 after the recreate" ;;
*) die "GET /uploads/ci-probe.png returned: $(printf '%s' "$headers" | head -n 1)" ;;
esac
printf '%s' "$headers" | tr '[:upper:]' '[:lower:]' | grep -q '^content-type: image/png' ||
	die "GET /uploads/ci-probe.png is not image/png: $headers"
ok "the probe is served as image/png"

echo "# 4. one-shot backup while the uploads change"
dc exec -T -u node api node -e \
	"require('node:fs').writeFileSync('/app/uploads/ci-churn.bin', Buffer.alloc(64 * 1024 * 1024))"
# Appends a byte every 5 ms for 60 s, then stops by itself (no cleanup needed).
dc exec -d -u node api node -e "const fs = require('node:fs');
const t = setInterval(() => fs.appendFileSync('/app/uploads/ci-churn.bin', 'x'), 5);
setTimeout(() => clearInterval(t), 60000);"
ok "a 64 MiB /app/uploads/ci-churn.bin grows every 5 ms"
# A dump older than BACKUP_RETENTION_DAYS (an imported one keeps its mtime): one-shot runs
# keep it, the next scheduled run (after the restore of step 5) prunes it.
dc exec -T backup sh -euc "cp \"\$(ls -tr /backups/db-*.dump | head -n 1)\" /backups/$OLD_DUMP
	touch -d @0 /backups/$OLD_DUMP" || die "could not plant $OLD_DUMP"
out=$(dc run --rm -T --no-deps -e BACKUP_ONESHOT=1 backup 2>&1) ||
	die "the one-shot backup failed while the uploads changed: $out"
printf '%s\n' "$out"
case "$out" in
*'uploads changed while archiving'*) ok "the one-shot backup exits 0 and logs that the uploads changed while archiving" ;;
*) die "the one-shot backup did not log 'uploads changed while archiving': $out" ;;
esac
# The script runs inside the backup container, so its variables must not expand here.
# shellcheck disable=SC2016
dc exec -T backup sh -euc '
	ls -l /backups
	dump=$(ls -t /backups/db-*.dump | head -n 1)
	archive=$(ls -t /backups/uploads-*.tar.gz | head -n 1)
	pg_restore --list "$dump" >/dev/null
	echo "pg_restore --list reads $dump"
	tar -tzf "$archive" | grep -q "ci-probe.png"
	echo "$archive lists ci-probe.png"
' || die "the backup files are missing or invalid"
ok "backup: db-*.dump readable by pg_restore and uploads-*.tar.gz lists ci-probe.png"
dc exec -T backup test -f "/backups/$OLD_DUMP" || die "the one-shot backup pruned $OLD_DUMP"
ok "the one-shot backup keeps $OLD_DUMP (mtime 1970): one-shot runs never prune"

EXPECTED_MIGRATIONS=$(jq '.entries | length' packages/db/drizzle/meta/_journal.json)

# Run the repository's `make prod-restore` against this project and env file (a make
# command-line variable overrides PROD_ENV_FILE; COMPOSE_PROJECT_NAME overrides `name:`).
prod_restore() {
	COMPOSE_PROJECT_NAME="$PROJECT" make -s PROD_ENV_FILE="$ENV_FILE" prod-restore "$@"
}

echo "# 5. restore onto a newer schema"
# The script runs inside the backup container, so its variables must not expand here.
# shellcheck disable=SC2016
D=$(dc exec -T backup sh -c 'basename "$(ls -t /backups/db-*.dump | head -n 1)"')
# shellcheck disable=SC2016
A=$(dc exec -T backup sh -c 'basename "$(ls -t /backups/uploads-*.tar.gz | head -n 1)"')
U0=$(echo 'select count(*) from "user";' | sql) || die "counting users failed"
ok "the step 4 backup is $D + $A ($U0 user)"
sql <<'SQL' || die "could not add the newer-schema table and the user row"
CREATE TABLE ci_newer (
  user_id varchar(36) REFERENCES "user"(id),
  recipe_id varchar(36) REFERENCES recipe(id)
);
INSERT INTO "user"(id, email, username, password_hash)
  VALUES (gen_random_uuid()::text, 'ci-after-backup@example.invalid', 'ci-after-backup', 'x');
SQL
dc exec -T -u node api rm /app/uploads/ci-probe.png || die "could not delete the probe"
ok "added ci_newer (foreign keys to user and recipe) and a user row, deleted the probe"
prod_restore DUMP="$D" UPLOADS="$A" || die "make prod-restore DUMP=$D UPLOADS=$A failed"
ok "make prod-restore DUMP=$D UPLOADS=$A exits 0"
wait_stack "postgres valkey api web backup" migrate
newer=$(echo "select to_regclass('public.ci_newer') is null;" | sql) || die "querying ci_newer failed"
[ "$newer" = "t" ] || die "the table ci_newer still exists after the restore"
ok "the table added after the backup is gone"
users=$(echo 'select count(*) from "user";' | sql) || die "counting users failed"
[ "$users" = "$U0" ] || die "the restored database has $users users (expected $U0)"
ok "the user count is back to $U0 (the row added after the backup is gone)"
migrations=$(echo 'select count(*) from drizzle.__drizzle_migrations;' | sql) ||
	die "counting migrations failed"
[ "$migrations" = "$EXPECTED_MIGRATIONS" ] ||
	die "the restored database records $migrations migrations (journal: $EXPECTED_MIGRATIONS)"
ok "the restored database records all $EXPECTED_MIGRATIONS journal migrations"
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$WEB/uploads/ci-probe.png" || true)
[ "$code" = "200" ] || die "GET /uploads/ci-probe.png after the restore returned $code"
ok "the deleted probe is served again after the restore"
# shellcheck disable=SC2016
safety=$(dc exec -T backup sh -c '
	for f in /backups/db-*.dump; do
		if pg_restore --list "$f" | grep -q " TABLE public ci_newer "; then
			basename "$f"
			exit 0
		fi
	done
	exit 1
') || die "no db-*.dump lists ci_newer: no safety backup was taken before the restore"
ok "the safety backup $safety holds the database as it was before the restore"

# The service container logs the prune of its start-up run; the safety backup (a one-shot
# run in its own container) would have deleted the file before that run could log it.
i=0
until dc logs --no-color backup | grep -q "pruned: $OLD_DUMP"; do
	i=$((i + 1))
	[ "$i" -lt 30 ] || die "the backup service log has no 'pruned: $OLD_DUMP' line after 30 s"
	sleep 1
done
dc exec -T backup test ! -e "/backups/$OLD_DUMP" ||
	die "$OLD_DUMP still exists after the scheduled start-up run"
ok "the scheduled start-up run after the restore pruned $OLD_DUMP (the safety backup kept it)"

echo "# 6. restore an older dump, then migrate applies the newer migration"
jq '.entries |= .[:-1]' packages/db/drizzle/meta/_journal.json >"$TMP/journal-old.json"
echo 'CREATE DATABASE ci_old;' | sql || die "could not create the scratch database ci_old"
# The URL is derived inside the container, so no password reaches a command line.
# shellcheck disable=SC2016
dc run --rm -T --no-deps \
	-v "$TMP/journal-old.json:/app/packages/db/drizzle/meta/_journal.json:ro" \
	--entrypoint sh migrate \
	-c 'DATABASE_URL="${DATABASE_URL%/*}/ci_old" exec node /app/packages/db/src/migrate.ts' ||
	die "migrating ci_old with the trimmed journal failed"
old_migrations=$(echo 'select count(*) from drizzle.__drizzle_migrations;' | DB=ci_old sql) ||
	die "counting the ci_old migrations failed"
[ "$old_migrations" = "$((EXPECTED_MIGRATIONS - 1))" ] ||
	die "ci_old records $old_migrations migrations (expected $((EXPECTED_MIGRATIONS - 1)))"
ok "ci_old holds the previous release's schema ($old_migrations migrations)"
out=$(dc run --rm -T --no-deps -e PGDATABASE=ci_old -e BACKUP_ONESHOT=1 -e BACKUP_UPLOADS=false \
	backup 2>&1) || die "dumping ci_old with the backup service failed: $out"
old=$(printf '%s\n' "$out" | sed -n 's/^\[backup\] database dump written: //p' | tr -d '\r')
[ -n "$old" ] || die "the backup service printed no dump name: $out"
ok "the backup service dumped ci_old as $old"
prod_restore DUMP="$old" || die "make prod-restore DUMP=$old failed"
ok "make prod-restore DUMP=$old exits 0"
wait_stack "postgres valkey api web backup" migrate
migrations=$(echo 'select count(*) from drizzle.__drizzle_migrations;' | sql) ||
	die "counting migrations failed"
[ "$migrations" = "$EXPECTED_MIGRATIONS" ] ||
	die "after migrate the database records $migrations migrations (journal: $EXPECTED_MIGRATIONS)"
ok "migrate applied the newest migration on top of the restored older schema"
users=$(echo 'select count(*) from "user";' | sql) || die "counting users failed"
[ "$users" = "1" ] || die "the restored empty database has $users users after migrate (expected 1)"
ok "migrate seeded the restored empty database in production mode (1 user)"

echo "# 7. graceful api stop"
api_id=$(dc ps -a -q api)
dc stop api
exit_code=$(docker inspect --format '{{.State.ExitCode}}' "$api_id")
[ "$exit_code" = "0" ] || die "the api exited with status $exit_code after stop"
ok "the api exits 0 on stop"
docker logs "$api_id" 2>&1 | grep -q 'Graceful shutdown complete' ||
	die "the api logs do not contain 'Graceful shutdown complete'"
ok "the api logs Graceful shutdown complete"

echo "# all compose smoke checks passed"
