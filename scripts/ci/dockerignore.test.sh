#!/bin/sh
# ============================================================
# Build-context test for the repository's .dockerignore (used by Dockerfile and
# Dockerfile.web). Run by the CI `images` job before the image builds.
#
# Usage: scripts/ci/dockerignore.test.sh
#
# Builds a `FROM scratch` / `COPY . /ctx/` image into a local folder from a temporary
# context that holds the repository's .dockerignore plus the local state the self-hosting
# guide creates inside a checkout: an unreadable `data/postgres` (mode 000, like the
# postgres data folder owned by uid 999), `data/uploads`, `backup-export/`,
# `uploads-rescue/`, `backups/`, `*.dump` files, an `uploads-*.tar.gz` archive and populated
# env files, next to the three committed `*.env.example` templates and `files/`.
# Asserts that the build succeeds (a `**/` exception would make Docker walk into the
# unreadable folder and fail with "permission denied"), that the templates and `files/` are
# in the context, and that the data folders, dumps, archives and env files are not.
# As root the unreadable folder is readable anyway; the presence/absence asserts still run.
#
# Prints one `ok`/`not ok` line per assertion and exits 1 when any assertion fails.
# Requires: docker with buildx.
# ============================================================
set -eu

cd "$(dirname "$0")/../.."
CTX=$(mktemp -d)
OUT=$(mktemp -d)
LOG=$(mktemp)
FAILURES=0

# Give the unreadable folder back to its owner so both temp dirs can be removed.
cleanup() {
	chmod -R u+rwx "$CTX" "$OUT" 2>/dev/null || true
	rm -rf "$CTX" "$OUT" "$LOG"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# Record a passing assertion.
ok() {
	echo "ok - $*"
}

# Record a failing assertion.
not_ok() {
	echo "not ok - $*"
	FAILURES=$((FAILURES + 1))
}

# Create the file $1 (relative to the context) with the content $2.
put() {
	mkdir -p "$CTX/$(dirname "$1")"
	printf '%s\n' "$2" >"$CTX/$1"
}

cp .dockerignore "$CTX/.dockerignore"
printf '%s\n' 'FROM scratch' 'COPY . /ctx/' >"$CTX/Dockerfile"
put data/postgres/18/docker/PG_VERSION 18
put data/uploads/x.jpg photo
put backup-export/db-1.dump dump
put uploads-rescue/a.jpg photo
put backups/b.dump dump
put pre-wave-6.dump dump
put db-20261118T000000Z.dump dump
put uploads-20261118T000000Z.tar.gz archive
put .env 'JWT_SECRET=real-secret'
put .env.production 'POSTGRES_PASSWORD=real-secret'
put apps/api/.env 'JWT_SECRET=real-secret'
put .env.example 'JWT_SECRET=change-me'
put apps/api/.env.example 'JWT_SECRET=change-me'
put apps/web/.env.example 'VITE_API_URL=/api/v1'
put files/scaa-2.json '{}'
chmod 000 "$CTX/data/postgres/18/docker"

echo "# build the context with the repository .dockerignore"
if docker buildx build --no-cache -q -o "type=local,dest=$OUT" "$CTX" >"$LOG" 2>&1; then
	ok "the build succeeds with an unreadable data/postgres folder in the context"
else
	not_ok "the build fails: $(tail -n 5 "$LOG")"
fi

echo "# required inputs are in the context"
for path in files/scaa-2.json .env.example apps/api/.env.example apps/web/.env.example; do
	if [ -f "$OUT/ctx/$path" ]; then
		ok "$path is in the context"
	else
		not_ok "$path is missing from the context"
	fi
done

echo "# local data, backups and env files are not"
for path in data backup-export uploads-rescue backups pre-wave-6.dump db-20261118T000000Z.dump \
	uploads-20261118T000000Z.tar.gz .env .env.production apps/api/.env; do
	if [ -e "$OUT/ctx/$path" ]; then
		not_ok "$path is in the context"
	else
		ok "$path is excluded"
	fi
done
leaked=$(find "$OUT" \( -name '*.dump' -o -name 'uploads-*.tar.gz' \) -print 2>/dev/null || true)
if [ -z "$leaked" ]; then
	ok "no *.dump or uploads-*.tar.gz file is in the context"
else
	not_ok "backup files are in the context: $leaked"
fi

if [ "$FAILURES" -gt 0 ]; then
	echo "# $FAILURES build-context check(s) failed" >&2
	exit 1
fi
echo "# all build-context checks passed"
