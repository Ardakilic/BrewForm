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
#      migrate exited 0 (fails after 300 s).
#   2. Through the web port: /healthz is 200 and /health is {"status":"ok"}; inside the api
#      container `node /app/healthcheck.mjs /ready` exits 0.
#   3. A 1x1 PNG written to /app/uploads as `node` survives `up -d --force-recreate api`
#      and is served as image/png at /uploads/ci-probe.png through the web edge.
#   4. A one-shot backup (BACKUP_ONESHOT=1) leaves a db-*.dump that `pg_restore --list`
#      reads and an uploads-*.tar.gz that lists ci-probe.png.
#   5. `stop api` exits 0 and the api logs `Graceful shutdown complete`.
# A trap prints `docker compose logs` on failure and always runs `down -v`.
# Prints one `ok`/`not ok` line per check and exits 1 on the first failure.
# Requires: docker (compose v2), curl, jq.
# ============================================================
set -eu

cd "$(dirname "$0")/../.."
ENV_FILE=${1:-scripts/ci/compose-smoke.env}
PROJECT=${2:-brewform-ci}
TIMEOUT=300
PNG_BASE64=iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==
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

echo "# 4. one-shot backup"
dc run --rm -e BACKUP_ONESHOT=1 backup
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

echo "# 5. graceful api stop"
api_id=$(dc ps -a -q api)
dc stop api
exit_code=$(docker inspect --format '{{.State.ExitCode}}' "$api_id")
[ "$exit_code" = "0" ] || die "the api exited with status $exit_code after stop"
ok "the api exits 0 on stop"
docker logs "$api_id" 2>&1 | grep -q 'Graceful shutdown complete' ||
	die "the api logs do not contain 'Graceful shutdown complete'"
ok "the api logs Graceful shutdown complete"

echo "# all compose smoke checks passed"
