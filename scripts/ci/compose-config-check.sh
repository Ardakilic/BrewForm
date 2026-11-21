#!/bin/sh
# ============================================================
# Static check of compose.production.yml: renders it with `docker compose config --format
# json` (placeholder values from scripts/ci/compose-smoke.env) and asserts the production
# contract with jq. Nothing is started; only docker compose and jq are required.
#
# Usage: scripts/ci/compose-config-check.sh [env-file]   (default: scripts/ci/compose-smoke.env)
#
# Asserts: health checks on every long-running service; start-up order (migrate ->
# api -> web); the literal UPLOAD_DIR; the one-variable data sources (named volume by
# default, bind mount for a path, undeclared volume names rejected); no password in any
# health-check, command or entrypoint string; `restore` only under its profile; memory
# limits, log rotation and restart policies on every service.
# Prints one `ok`/`not ok` line per assertion and exits 1 when any assertion fails.
# ============================================================
set -eu

cd "$(dirname "$0")/../.."
ENV_FILE=${1:-scripts/ci/compose-smoke.env}
PROD_FILE=compose.production.yml
PROJECT=brewform-ci
TMP=$(mktemp -d)
FAILURES=0
trap 'rm -rf "$TMP"' EXIT INT TERM

# The checks below decide these values themselves; never inherit them from the caller.
unset UPLOADS_SOURCE POSTGRES_DATA_SOURCE BACKUPS_SOURCE UPLOAD_DIR COMPOSE_PROFILES \
	COMPOSE_PROJECT_NAME COMPOSE_FILE 2>/dev/null || true

# Render the compose file to JSON on stdout; extra arguments go before `config`.
render() {
	docker compose -p "$PROJECT" --env-file "$ENV_FILE" -f "$PROD_FILE" ${1+"$@"} config --format json
}

# Assert that the jq filter $3 is true for the rendered JSON file $2; $1 describes it.
check() {
	if jq -e "$3" "$2" >/dev/null 2>&1; then
		echo "ok - $1"
	else
		echo "not ok - $1"
		FAILURES=$((FAILURES + 1))
	fi
}

# Render into the file $1 (remaining arguments go before `config`); when rendering fails,
# report it with compose's error and stop (every later check needs the rendered JSON).
render_to() {
	out=$1
	shift
	if ! render ${1+"$@"} >"$out" 2>"$TMP/render.err"; then
		echo "not ok - $PROD_FILE renders with $ENV_FILE ($(basename "$out" .json))"
		cat "$TMP/render.err" >&2
		exit 1
	fi
}

# Variable overrides run in subshells so they never leak into the next render.
render_to "$TMP/default.json"
render_to "$TMP/restore.json" --profile restore
(
	export UPLOADS_SOURCE=./ci-data/uploads
	render_to "$TMP/bind.json"
) || exit 1
(
	export UPLOAD_DIR=/tmp/elsewhere
	render_to "$TMP/upload-dir.json"
) || exit 1
if ! docker compose --env-file "$ENV_FILE" -f "$PROD_FILE" config --format json \
	>"$TMP/named.json" 2>"$TMP/render.err"; then
	echo "not ok - $PROD_FILE renders without -p"
	cat "$TMP/render.err" >&2
	exit 1
fi

D="$TMP/default.json"
echo "# health checks and start-up order"
for svc in postgres valkey api web backup; do
	check "$svc has a healthcheck test" "$D" ".services.$svc.healthcheck.test | length > 0"
done
check "api waits for migrate to complete successfully" "$D" \
	'.services.api.depends_on.migrate.condition == "service_completed_successfully"'
check "api waits for a healthy postgres" "$D" \
	'.services.api.depends_on.postgres.condition == "service_healthy"'
check "api waits for a healthy valkey" "$D" \
	'.services.api.depends_on.valkey.condition == "service_healthy"'
check "web waits for a healthy api" "$D" '.services.web.depends_on.api.condition == "service_healthy"'
check "migrate waits for a healthy postgres" "$D" \
	'.services.migrate.depends_on.postgres.condition == "service_healthy"'
check "backup waits for a healthy postgres" "$D" \
	'.services.backup.depends_on.postgres.condition == "service_healthy"'
check "api probes readiness with the bundled script" "$D" \
	'.services.api.healthcheck.test == ["CMD", "node", "/app/healthcheck.mjs", "/ready"]'
check "web probes its local /healthz" "$D" \
	'.services.web.healthcheck.test == ["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1/healthz"]'

echo "# upload directory and data sources"
check "api UPLOAD_DIR is /app/uploads" "$D" '.services.api.environment.UPLOAD_DIR == "/app/uploads"'
check "UPLOAD_DIR in the env file cannot move the upload directory" "$TMP/upload-dir.json" \
	'.services.api.environment.UPLOAD_DIR == "/app/uploads"'
check "api /app/uploads is the named volume uploads by default" "$D" \
	'[.services.api.volumes[] | select(.target == "/app/uploads")]
	 | length == 1 and .[0].type == "volume" and .[0].source == "uploads"'
check "postgres data is the named volume postgres_data by default" "$D" \
	'[.services.postgres.volumes[] | select(.target == "/var/lib/postgresql")]
	 | length == 1 and .[0].type == "volume" and .[0].source == "postgres_data"'
check "backups go to the named volume backups by default" "$D" \
	'[.services.backup.volumes[] | select(.target == "/backups")]
	 | length == 1 and .[0].type == "volume" and .[0].source == "backups"'
check "UPLOADS_SOURCE=./ci-data/uploads makes the api mount an absolute bind" "$TMP/bind.json" \
	'[.services.api.volumes[] | select(.target == "/app/uploads")]
	 | length == 1 and .[0].type == "bind"
	   and (.[0].source | startswith("/") and endswith("/ci-data/uploads"))'
check "the backup service mounts that folder read-only at /uploads" "$TMP/bind.json" \
	'[.services.backup.volumes[] | select(.target == "/uploads")]
	 | length == 1 and .[0].type == "bind" and .[0].read_only == true
	   and (.[0].source | endswith("/ci-data/uploads"))'
if (
	export UPLOADS_SOURCE=photos
	render >/dev/null 2>"$TMP/photos.err"
); then
	echo "not ok - UPLOADS_SOURCE=photos (undeclared volume) makes config fail"
	FAILURES=$((FAILURES + 1))
elif grep -q 'photos' "$TMP/photos.err"; then
	echo "ok - UPLOADS_SOURCE=photos (undeclared volume) makes config fail"
else
	echo "not ok - UPLOADS_SOURCE=photos fails, but the error does not name the volume"
	FAILURES=$((FAILURES + 1))
fi

echo "# secrets, profiles and project"
check "no healthcheck, command or entrypoint string contains a password" "$TMP/restore.json" \
	'[.services[] | (.healthcheck.test, .command, .entrypoint) | select(. != null)
	  | if type == "array" then .[] else . end | strings
	  | select(contains("ci0valkey0pw") or contains("ci-postgres-pw"))] | length == 0'
check "restore is absent without --profile restore" "$D" '.services | has("restore") | not'
check "restore appears with --profile restore" "$TMP/restore.json" '.services | has("restore")'
check "the project is named brewform-prod" "$TMP/named.json" '.name == "brewform-prod"'
check "the api publishes no host port" "$D" '(.services.api.ports // []) | length == 0'

echo "# limits, logging and restart policies"
check "every service has a memory limit" "$TMP/restore.json" \
	'[.services[] | .deploy.resources.limits.memory] | all(. != null)'
check "every service rotates json-file logs" "$TMP/restore.json" \
	'[.services[] | .logging | .driver == "json-file"
	  and .options["max-size"] != null and .options["max-file"] != null] | all'
check "long-running services restart unless stopped" "$D" \
	'[.services | (.postgres, .valkey, .api, .web, .backup) | .restart == "unless-stopped"] | all'
check "one-shot services never restart" "$TMP/restore.json" \
	'[.services | (.migrate, .restore) | .restart == "no"] | all'

if [ "$FAILURES" -gt 0 ]; then
	echo "# $FAILURES compose check(s) failed" >&2
	exit 1
fi
echo "# all compose checks passed"
