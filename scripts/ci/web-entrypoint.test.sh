#!/bin/sh
# ============================================================
# Behaviour test for the web image entrypoint and Caddy edge (docker-web-entrypoint.sh,
# apps/web/Caddyfile), run against a BUILT web image.
#
# Usage: scripts/ci/web-entrypoint.test.sh [image]   (default: brewform-web:local)
#
# Every container runs on a throwaway network and publishes no host port: requests are
# made with the image's own BusyBox wget through `docker exec`, so the client is
# 127.0.0.1 inside the web container. An "echo" upstream (the same image running a tiny
# Caddyfile) reflects the forwarding headers, the URI and the body it receives, which
# proves the client-IP contract with the API (exactly one X-Forwarded-For entry plus
# X-Real-IP, both the client IP resolved right-to-left from TRUSTED_PROXIES). The echo
# reads the whole body, as the API does, so the edge's EDGE_MAX_BODY_SIZE cap answers 413.
#
# Prints one `ok`/`not ok` line per assertion and exits 1 (after dumping container logs)
# when any assertion fails. Requires only docker.
# ============================================================
set -eu

IMAGE=${1:-brewform-web:local}
P="bf-webtest-$$"
NET="$P-net"
FAILURES=0
NL='
'

# Remove every container and the network this run created.
cleanup() {
	ids=$(docker ps -aq --filter "name=^$P-" 2>/dev/null || true)
	if [ -n "$ids" ]; then
		# shellcheck disable=SC2086
		docker rm -f $ids >/dev/null 2>&1 || true
	fi
	docker network rm "$NET" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

# Record a passing assertion.
ok() {
	echo "ok - $*"
}

# Record a failing assertion.
not_ok() {
	echo "not ok - $*"
	FAILURES=$((FAILURES + 1))
}

# Assert that $2 contains $3 (fixed string); $1 is the description.
assert_contains() {
	case "$2" in
	*"$3"*) ok "$1" ;;
	*) not_ok "$1 (expected to contain: $3; got: $(printf '%s' "$2" | head -c 300))" ;;
	esac
}

# Assert that $2 does not contain $3 (fixed string); $1 is the description.
assert_not_contains() {
	case "$2" in
	*"$3"*) not_ok "$1 (must not contain: $3)" ;;
	*) ok "$1" ;;
	esac
}

# Assert that $2 equals $3; $1 is the description.
assert_eq() {
	if [ "$2" = "$3" ]; then ok "$1"; else not_ok "$1 (expected: $3; got: $2)"; fi
}

# Start a web container named $P-$1 with the remaining arguments as `docker run` options,
# then wait until its /healthz answers. Fails the run if the container dies.
start_web() {
	name="$P-$1"
	shift
	docker run -d --name "$name" --network "$NET" ${1+"$@"} "$IMAGE" >/dev/null
	i=0
	while [ "$i" -lt 30 ]; do
		if docker exec "$name" wget -q -O /dev/null http://127.0.0.1/healthz 2>/dev/null; then
			return 0
		fi
		if [ "$(docker inspect --format '{{.State.Running}}' "$name")" != "true" ]; then
			break
		fi
		i=$((i + 1))
		sleep 1
	done
	echo "container $name did not become ready; logs:" >&2
	docker logs "$name" >&2 || true
	exit 1
}

# GET http://127.0.0.1$2 inside container $P-$1 and print the body (extra wget options
# follow). Prints nothing when the request fails.
fetch() {
	name="$P-$1"
	path=$2
	shift 2
	docker exec "$name" wget -q -O - ${1+"$@"} "http://127.0.0.1$path" 2>/dev/null || true
}

# Print the HTTP status code of GET (or POST with options) http://127.0.0.1$2 in $P-$1.
status() {
	name="$P-$1"
	path=$2
	shift 2
	docker exec "$name" wget -S -O /dev/null ${1+"$@"} "http://127.0.0.1$path" 2>&1 |
		awk '/^  HTTP\//{code=$2} END{print code}'
}

# Print the response headers of GET http://127.0.0.1$2 in container $P-$1.
headers() {
	docker exec "$P-$1" wget -S -q -O /dev/null "http://127.0.0.1$2" 2>&1 || true
}

# Print the container's logs (stdout and stderr).
logs() {
	docker logs "$P-$1" 2>&1
}

# md5 of a file in the pristine image (build output).
image_md5() {
	docker run --rm --entrypoint md5sum "$IMAGE" "$1" | cut -d' ' -f1
}

# md5 of a file inside running container $P-$1.
container_md5() {
	docker exec "$P-$1" md5sum "$2" | cut -d' ' -f1
}

docker image inspect "$IMAGE" >/dev/null
docker network create "$NET" >/dev/null
INDEX_MD5=$(image_md5 /usr/share/caddy/index.html)
ROBOTS_MD5=$(image_md5 /usr/share/caddy/robots.txt)

echo "# 1. defaults: static-only mode"
start_web plain
assert_eq "/healthz answers ok" "$(fetch plain /healthz)" "ok"
assert_contains "/healthz is never cached" "$(headers plain /healthz)" "Cache-Control: no-store"
assert_contains "unset upstream: /api/v1/x falls back to index.html" "$(fetch plain /api/v1/x)" 'id="root"'
assert_contains "unset upstream: /health is the SPA, not proxied" "$(fetch plain /health)" 'id="root"'
assert_contains "unset upstream: /sitemap.xml is the SPA, not proxied" "$(fetch plain /sitemap.xml)" 'id="root"'
assert_contains "SPA route falls back to index.html" "$(fetch plain /some/spa/route)" 'id="root"'
assert_contains "default /config.js is the empty config" "$(fetch plain /config.js)" \
	'globalThis.__BREWFORM_CONFIG__ = globalThis.__BREWFORM_CONFIG__ || {};'
assert_contains "/config.js is never cached" "$(headers plain /config.js)" "Cache-Control: no-store"
assert_eq "unset PUBLIC_APP_URL keeps index.html byte-identical" \
	"$(container_md5 plain /usr/share/caddy/index.html)" "$INDEX_MD5"
assert_eq "unset PUBLIC_APP_URL keeps robots.txt byte-identical" \
	"$(container_md5 plain /usr/share/caddy/robots.txt)" "$ROBOTS_MD5"
assert_not_contains "pristine *.orig copies live outside the web root" \
	"$(docker exec "$P-plain" ls /usr/share/caddy)" ".orig"
LOGS=$(logs plain)
assert_contains "logs: API proxy disabled" "$LOGS" "API proxy disabled (API_UPSTREAM not set)"
assert_contains "logs: trusted proxies disabled" "$LOGS" "trusted proxies disabled"
assert_contains "logs: no runtime PUBLIC_APP_URL" "$LOGS" "no runtime PUBLIC_APP_URL set"
assert_contains "image healthcheck reports healthy" \
	"$(sleep 2; docker inspect --format '{{.State.Health.Status}}' "$P-plain")" "healthy"

echo "# 2. invalid values are ignored and never echoed"
start_web badvals \
	-e 'API_UPSTREAM=api:8000; rm -rf /' \
	-e 'TRUSTED_PROXIES=10.0.0.0/8;evil' \
	-e 'PUBLIC_APP_URL=javascript:alert(1)' \
	-e 'VITE_API_URL=https://api.example.com/"quote'
LOGS=$(logs badvals)
assert_contains "invalid API_UPSTREAM: warning" "$LOGS" \
	"WARNING: API_UPSTREAM is not a valid host[:port]; API proxy disabled"
assert_contains "invalid API_UPSTREAM: static-only mode" "$(fetch badvals /api/v1/x)" 'id="root"'
assert_eq "invalid API_UPSTREAM: no proxy snippet" \
	"$(docker exec "$P-badvals" ls /etc/caddy/conf.d)" ""
assert_contains "invalid TRUSTED_PROXIES: warning" "$LOGS" \
	"WARNING: TRUSTED_PROXIES is not a list of ranges"
assert_contains "javascript: PUBLIC_APP_URL: warning" "$LOGS" \
	"WARNING: PUBLIC_APP_URL is not a valid http(s) origin"
assert_eq "javascript: PUBLIC_APP_URL: index.html unchanged" \
	"$(container_md5 badvals /usr/share/caddy/index.html)" "$INDEX_MD5"
assert_contains "VITE_API_URL with a quote: warning" "$LOGS" \
	"WARNING: VITE_API_URL is not a valid URL/path"
assert_contains "VITE_API_URL with a quote: default config.js" "$(fetch badvals /config.js)" \
	'globalThis.__BREWFORM_CONFIG__ = globalThis.__BREWFORM_CONFIG__ || {};'
assert_not_contains "invalid values are not echoed (upstream)" "$LOGS" "rm -rf"
assert_not_contains "invalid values are not echoed (public URL)" "$LOGS" "javascript:"
assert_not_contains "invalid values are not echoed (API URL)" "$LOGS" '"quote'
assert_not_contains "invalid values are not echoed (proxies)" "$LOGS" "evil"

start_web newlines \
	-e "API_UPSTREAM=api:8000${NL}}" \
	-e "VITE_API_URL=/api/v1${NL}\"};alert(1);//"
LOGS=$(logs newlines)
assert_contains "API_UPSTREAM with a newline is invalid" "$LOGS" \
	"WARNING: API_UPSTREAM is not a valid host[:port]"
assert_contains "VITE_API_URL with a newline writes the default config.js" \
	"$(fetch newlines /config.js)" 'globalThis.__BREWFORM_CONFIG__ = globalThis.__BREWFORM_CONFIG__ || {};'

echo "# 3. valid runtime values are applied"
start_web public \
	-e PUBLIC_APP_URL=https://brew.example.org/ \
	-e VITE_API_URL=https://api.example.com/api/v1
INDEX=$(fetch public /)
assert_contains "PUBLIC_APP_URL rewrites og:image" "$INDEX" \
	'<meta property="og:image" content="https://brew.example.org/og-default.png"'
assert_contains "PUBLIC_APP_URL rewrites twitter:image" "$INDEX" \
	'<meta name="twitter:image" content="https://brew.example.org/og-default.png"'
assert_not_contains "no build-time origin remains in index.html" "$INDEX" "http://localhost:8080"
assert_contains "PUBLIC_APP_URL rewrites the robots Sitemap line" "$(fetch public /robots.txt)" \
	"Sitemap: https://brew.example.org/sitemap.xml"
assert_contains "valid VITE_API_URL is written to config.js" "$(fetch public /config.js)" \
	'globalThis.__BREWFORM_CONFIG__ = { apiUrl: "https://api.example.com/api/v1" };'
assert_contains "logs: PUBLIC_APP_URL applied" "$(logs public)" \
	"runtime PUBLIC_APP_URL applied: https://brew.example.org"

echo "# 4. same-origin edge with an echo upstream"
docker run -d --name "$P-echo" --network "$NET" --entrypoint sh "$IMAGE" -c '
printf "%s\n" "{" "admin off" "}" ":9000 {" \
  "respond \"xff=[{header.X-Forwarded-For}] xri=[{header.X-Real-IP}] uri={uri} body={http.request.body}\" 200" \
  "}" >/tmp/echo.caddy
exec caddy run --config /tmp/echo.caddy --adapter caddyfile' >/dev/null
start_web edge -e "API_UPSTREAM=$P-echo:9000"
assert_contains "logs: API proxy applied" "$(logs edge)" "API proxy applied"
assert_contains "/api/* is proxied with path and query" "$(fetch edge '/api/v1/sitemap.xml?a=1')" \
	"uri=/api/v1/sitemap.xml?a=1"
assert_contains "/sitemap.xml is proxied with its query" \
	"$(fetch edge '/sitemap.xml?part=recipes&page=2')" "uri=/sitemap.xml?part=recipes&page=2"
assert_contains "logs: the proxy covers /sitemap.xml" "$(logs edge)" \
	"API proxy applied: /api/* /uploads/* /share/* /health /sitemap.xml"
assert_contains "/uploads/* is proxied" "$(fetch edge /uploads/x.png)" "uri=/uploads/x.png"
assert_contains "/share/* is proxied" "$(fetch edge /share/abc)" "uri=/share/abc"
assert_contains "/health (exact) is proxied" "$(fetch edge /health)" "uri=/health"
assert_contains "/ready is not proxied" "$(fetch edge /ready)" 'id="root"'
assert_contains "/healthz stays local" "$(fetch edge /healthz)" "ok"
assert_contains "spoofed headers from an untrusted client are replaced" \
	"$(fetch edge /api/v1/ip --header 'X-Forwarded-For: 1.2.3.4' --header 'X-Real-IP: 1.2.3.4')" \
	"xff=[127.0.0.1] xri=[127.0.0.1]"

start_web trusted -e "API_UPSTREAM=$P-echo:9000" -e TRUSTED_PROXIES=private_ranges
assert_contains "logs: trusted proxies applied" "$(logs trusted)" \
	"trusted proxies applied (right-to-left): private_ranges"
assert_contains "trusted proxy: right-most untrusted address is the client" \
	"$(fetch trusted /api/v1/ip --header 'X-Forwarded-For: 1.2.3.4, 203.0.113.9')" \
	"xff=[203.0.113.9] xri=[203.0.113.9]"
assert_contains "trusted proxy: trusted hops are skipped right-to-left" \
	"$(fetch trusted /api/v1/ip --header 'X-Forwarded-For: 1.2.3.4, 10.0.0.5')" \
	"xff=[1.2.3.4] xri=[1.2.3.4]"

start_web bodycap -e "API_UPSTREAM=$P-echo:9000" -e EDGE_MAX_BODY_SIZE=1KB
# Text bodies: the echo's {http.request.body} placeholder does not reliably consume a
# body of NUL bytes, and the cap only answers 413 once the upstream reads past it.
docker exec "$P-bodycap" sh -c \
	'head -c 4096 /dev/zero | tr "\0" a >/tmp/big; head -c 512 /dev/zero | tr "\0" a >/tmp/small'
assert_eq "body above EDGE_MAX_BODY_SIZE is rejected with 413" \
	"$(status bodycap /api/v1/photos --post-file=/tmp/big)" "413"
assert_eq "body below EDGE_MAX_BODY_SIZE is proxied" \
	"$(status bodycap /api/v1/photos --post-file=/tmp/small)" "200"

docker stop "$P-echo" >/dev/null
assert_eq "upstream down: proxied path returns 502" "$(status edge /api/v1/x)" "502"
assert_eq "upstream down: /healthz still 200" "$(status edge /healthz)" "200"
assert_contains "upstream down: / still serves the SPA" "$(fetch edge /)" 'id="root"'

if [ "$FAILURES" -gt 0 ]; then
	echo "# $FAILURES assertion(s) failed; container logs follow" >&2
	for c in $(docker ps -aq --filter "name=^$P-"); do
		echo "## $(docker inspect --format '{{.Name}}' "$c")" >&2
		docker logs "$c" >&2 2>&1 || true
	done
	exit 1
fi
echo "# all web entrypoint checks passed"
