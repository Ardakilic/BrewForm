#!/bin/sh
# ============================================================
# Boot test of the two BUILT images, standalone (no compose): the API image against a
# disposable Postgres, the web image as the edge in front of it, and the API's fail-fast
# check for an unwritable uploads bind mount. Run by the CI `images` job and locally.
#
# Usage: scripts/ci/smoke-images.sh [api-image] [web-image]
#        (defaults: brewform-api:local brewform-web:local, as built by `make images`)
#
# Checks, in order:
#   1. postgres:18-trixie, then the API image in `serve` mode (migrations + first-install
#      seed) with APP_ENV=production and a named volume at /app/uploads, with NO health-check
#      override: the container's own HEALTHCHECK must report `healthy` within 180 s. Then
#      `id -u` is 1000, GET /health is {"status":"ok"} and GET /ready is 200 with exactly
#      the keys status, db, cache, rateLimitStore, storage, shuttingDown and status "ready".
#   2. The web image with API_UPSTREAM pointing at the API: `healthy` through its own
#      HEALTHCHECK, /healthz 200, / is the SPA (id="root"), /health is the API liveness
#      JSON through the edge, /api/v1/sitemap.xml is the API's XML through the edge.
#   3. scripts/ci/web-entrypoint.test.sh against the web image (includes the echo-upstream
#      client-IP checks: one X-Forwarded-For entry plus X-Real-IP, spoofed headers replaced).
#   4. Uploads bind mount: the API with RUN_MIGRATIONS=false, an unreachable DATABASE_URL
#      and /app/uploads bind-mounted from a root-owned 0755 `mktemp -d` folder must exit 1
#      logging "is not writable by uid 1000 gid 1000"; with the folder owned by 1000:1000
#      and the real database it must become `healthy`.
#
# Ownership changes use `sudo` when it needs no password (GitHub-hosted runners) and a
# root helper container otherwise (developer machines). Docker Desktop and OrbStack on
# macOS do not enforce host ownership on bind mounts, so the negative check of step 4 is
# reported as skipped there; with CI set, a skip counts as a failure.
#
# Every container, the network, the volume and the folder are removed by a trap. On any
# failure the logs of every container this run started are printed. Prints one
# `ok`/`not ok` line per assertion and exits 1 when any assertion fails.
# Requires: docker, curl, jq.
# ============================================================
set -eu

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
API_IMAGE=${1:-brewform-api:local}
WEB_IMAGE=${2:-brewform-web:local}
P="bf-smoke-$$"
NET="$P-net"
VOLUME="$P-uploads"
PG_PASSWORD=smoke-postgres-pw
DB_URL="postgresql://brewform:$PG_PASSWORD@$P-db:5432/brewform"
TMP=$(mktemp -d)
BIND_DIR=""
FAILURES=0

# Record a passing assertion.
ok() {
	echo "ok - $*"
}

# Record a failing assertion.
not_ok() {
	echo "not ok - $*"
	FAILURES=$((FAILURES + 1))
}

# Abort the run (the EXIT trap prints the container logs and cleans up).
die() {
	echo "not ok - $*" >&2
	exit 1
}

# Give the bind-mount folder $2 the owner $1 (uid:gid or names) and mode 0755.
chown_dir() {
	if [ "$(id -u)" = 0 ]; then
		chown "$1" "$2" && chmod 0755 "$2"
	elif sudo -n true 2>/dev/null; then
		sudo chown "$1" "$2" && sudo chmod 0755 "$2"
	else
		docker run --rm --user 0:0 --entrypoint sh -v "$2:/d" "$API_IMAGE" \
			-c "chown $1 /d && chmod 0755 /d"
	fi
}

# Print the logs of every container this run started.
dump_logs() {
	for c in $(docker ps -aq --filter "name=^$P-" 2>/dev/null || true); do
		echo "## logs: $(docker inspect --format '{{.Name}}' "$c")" >&2
		docker logs --tail 300 "$c" >&2 2>&1 || true
	done
}

# Remove every container, the network, the volume and the temporary folders.
cleanup() {
	ids=$(docker ps -aq --filter "name=^$P-" 2>/dev/null || true)
	if [ -n "$ids" ]; then
		# shellcheck disable=SC2086
		docker rm -f $ids >/dev/null 2>&1 || true
	fi
	docker network rm "$NET" >/dev/null 2>&1 || true
	docker volume rm "$VOLUME" >/dev/null 2>&1 || true
	if [ -n "$BIND_DIR" ] && [ -d "$BIND_DIR" ]; then
		chown_dir "$(id -u):$(id -g)" "$BIND_DIR" >/dev/null 2>&1 || true
		rm -rf "$BIND_DIR" 2>/dev/null || true
	fi
	rm -rf "$TMP"
}

# EXIT trap: logs on failure, then cleanup, keeping the exit status.
on_exit() {
	status=$?
	if [ "$status" -ne 0 ] || [ "$FAILURES" -gt 0 ]; then
		dump_logs
	fi
	cleanup
	exit "$status"
}
trap on_exit EXIT
trap 'exit 130' INT TERM

# Wait up to $2 seconds until container $1 reports `healthy` through its own HEALTHCHECK.
wait_healthy() {
	i=0
	while [ "$i" -lt "$2" ]; do
		state=$(docker inspect --format \
			'{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$1")
		case "$state" in
		"running healthy")
			ok "$1 reports healthy through its own HEALTHCHECK (${i}s)"
			return 0
			;;
		"running none") die "$1 has no HEALTHCHECK" ;;
		running*) ;;
		*) die "$1 stopped before becoming healthy (state: $state)" ;;
		esac
		i=$((i + 1))
		sleep 1
	done
	die "$1 did not become healthy within $2 s"
}

# Wait up to $2 seconds for container $1 to exit, then print its exit code ("timeout"
# when it is still running).
wait_exit() {
	i=0
	while [ "$i" -lt "$2" ]; do
		if [ "$(docker inspect --format '{{.State.Status}}' "$1")" = "exited" ]; then
			docker inspect --format '{{.State.ExitCode}}' "$1"
			return 0
		fi
		i=$((i + 1))
		sleep 1
	done
	echo timeout
}

# Print the host port that container $1 publishes for its port $2.
host_port() {
	docker port "$1" "$2/tcp" | head -n 1 | sed 's/.*://'
}

# Print the HTTP status code of GET $1 (000 when the request fails).
http_status() {
	curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$1" || true
}

# Print the body of GET $1 (nothing when the request fails).
http_body() {
	curl -s --max-time 10 "$1" || true
}

# Assert that the JSON text $2 satisfies the jq filter $3; $1 is the description.
assert_json() {
	if printf '%s' "$2" | jq -e "$3" >/dev/null 2>&1; then
		ok "$1"
	else
		not_ok "$1 (got: $(printf '%s' "$2" | head -c 300))"
	fi
}

# Assert that $2 equals $3; $1 is the description.
assert_eq() {
	if [ "$2" = "$3" ]; then ok "$1"; else not_ok "$1 (expected: $3; got: $2)"; fi
}

# Assert that $2 contains the fixed string $3; $1 is the description.
assert_contains() {
	case "$2" in
	*"$3"*) ok "$1" ;;
	*) not_ok "$1 (expected to contain: $3; got: $(printf '%s' "$2" | head -c 300))" ;;
	esac
}

# Start an API container named $P-$1; the remaining arguments are extra `docker run`
# options (DATABASE_URL, mounts, ports).
run_api() {
	name="$P-$1"
	shift
	docker run -d --name "$name" --network "$NET" \
		-e APP_ENV=production \
		-e LOG_FORMAT=json \
		-e JWT_SECRET=smoke-jwt-secret-0123456789 \
		-e ADMIN_PASSWORD=smoke-admin-pw-123 \
		-e APP_URL=http://localhost:8080 \
		-e CORS_ALLOWED_ORIGINS=http://localhost:8080 \
		-e CACHE_DRIVER=memory \
		-e RATE_LIMIT_STORE=memory \
		-e STORAGE_DRIVER=local \
		${1+"$@"} "$API_IMAGE" >/dev/null
}

docker image inspect "$API_IMAGE" >/dev/null
docker image inspect "$WEB_IMAGE" >/dev/null
docker network create "$NET" >/dev/null
docker volume create "$VOLUME" >/dev/null

echo "# 1. API image against a disposable Postgres"
docker run -d --name "$P-db" --network "$NET" \
	-e POSTGRES_USER=brewform -e POSTGRES_PASSWORD="$PG_PASSWORD" -e POSTGRES_DB=brewform \
	postgres:18-trixie >/dev/null
# TCP, not the socket: the image's init server listens on the socket only.
i=0
until docker exec "$P-db" pg_isready -h 127.0.0.1 -U brewform -d brewform >/dev/null 2>&1; do
	i=$((i + 1))
	[ "$i" -lt 90 ] || die "postgres did not accept TCP connections within 90 s"
	sleep 1
done
ok "postgres accepts connections (${i}s)"

run_api api -e DATABASE_URL="$DB_URL" -v "$VOLUME:/app/uploads" -p 127.0.0.1::8000
wait_healthy "$P-api" 180
API="http://127.0.0.1:$(host_port "$P-api" 8000)"
assert_eq "the API runs as uid 1000" "$(docker exec "$P-api" id -u)" "1000"
assert_eq "GET /health returns 200" "$(http_status "$API/health")" "200"
assert_json 'GET /health returns {"status":"ok"}' "$(http_body "$API/health")" \
	'. == {"status": "ok"}'
assert_eq "GET /ready returns 200" "$(http_status "$API/ready")" "200"
assert_json "GET /ready has exactly the readiness keys and status ready" \
	"$(http_body "$API/ready")" \
	'(keys == ["cache", "db", "rateLimitStore", "shuttingDown", "status", "storage"])
	 and .status == "ready"'

echo "# 2. web image as the edge in front of the API"
docker run -d --name "$P-web" --network "$NET" -e "API_UPSTREAM=$P-api:8000" \
	-p 127.0.0.1::80 "$WEB_IMAGE" >/dev/null
wait_healthy "$P-web" 60
WEB="http://127.0.0.1:$(host_port "$P-web" 80)"
assert_eq "GET /healthz returns 200" "$(http_status "$WEB/healthz")" "200"
assert_contains "GET / returns the SPA index.html" "$(http_body "$WEB/")" 'id="root"'
assert_json "GET /health through the edge returns the API liveness JSON" \
	"$(http_body "$WEB/health")" '. == {"status": "ok"}'
SITEMAP_HEADERS=$(curl -s --max-time 10 -D - -o "$TMP/sitemap.xml" "$WEB/api/v1/sitemap.xml" || true)
assert_contains "GET /api/v1/sitemap.xml through the edge returns 200" \
	"$(printf '%s' "$SITEMAP_HEADERS" | head -n 1)" " 200"
assert_contains "the sitemap is served as XML" \
	"$(printf '%s' "$SITEMAP_HEADERS" | tr '[:upper:]' '[:lower:]' | grep '^content-type:' || true)" "xml"
assert_contains "the sitemap body is the API's XML urlset" "$(head -c 300 "$TMP/sitemap.xml")" \
	'<urlset'

echo "# 3. web entrypoint and edge behaviour (incl. echo-upstream client-IP checks)"
if "$SCRIPT_DIR/web-entrypoint.test.sh" "$WEB_IMAGE"; then
	ok "scripts/ci/web-entrypoint.test.sh passes"
else
	not_ok "scripts/ci/web-entrypoint.test.sh failed (see its output above)"
fi

echo "# 4. uploads bind mount ownership"
BIND_DIR=$(mktemp -d)
chown_dir root:root "$BIND_DIR"
if docker run --rm --user 1000:1000 --entrypoint sh -v "$BIND_DIR:/probe" "$API_IMAGE" \
	-c 'touch /probe/.probe' >/dev/null 2>&1; then
	docker run --rm --user 0:0 --entrypoint sh -v "$BIND_DIR:/probe" "$API_IMAGE" \
		-c 'rm -f /probe/.probe' >/dev/null 2>&1 || true
	if [ -n "${CI:-}" ]; then
		not_ok "a root-owned 0755 bind mount is writable by uid 1000 (ownership not enforced)"
	else
		ok "# SKIP root-owned bind mount check: this Docker host does not enforce bind-mount ownership"
	fi
else
	run_api api-ro -e RUN_MIGRATIONS=false \
		-e "DATABASE_URL=postgresql://brewform:unused@$P-nowhere:5432/brewform" \
		-v "$BIND_DIR:/app/uploads"
	assert_eq "root-owned uploads folder: the API exits with status 1" \
		"$(wait_exit "$P-api-ro" 60)" "1"
	assert_contains "root-owned uploads folder: the log names the fix" \
		"$(docker logs "$P-api-ro" 2>&1)" "is not writable by uid 1000 gid 1000"
fi
chown_dir 1000:1000 "$BIND_DIR"
run_api api-rw -e RUN_MIGRATIONS=false -e DATABASE_URL="$DB_URL" -v "$BIND_DIR:/app/uploads"
wait_healthy "$P-api-rw" 180

if [ "$FAILURES" -gt 0 ]; then
	echo "# $FAILURES image smoke assertion(s) failed" >&2
	exit 1
fi
echo "# all image smoke checks passed"
