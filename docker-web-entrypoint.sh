#!/bin/sh
# ============================================================
# BrewForm web image entrypoint: applies the runtime configuration, then execs Caddy.
#
# Every decision logs exactly one `[web-entrypoint]` line (applied, disabled or invalid).
# Invalid values are never echoed. Every value is checked against an allowlist before it
# is written into JavaScript, a Caddyfile snippet or a sed expression, and a value that
# contains a newline is always invalid (grep matches line by line, so a valid first line
# must not smuggle a second one through).
#
#   VITE_API_URL       Overrides the build-time API base URL through /config.js (absolute
#                      http(s) URL or root-relative path). Unset: empty config, the SPA
#                      keeps the URL baked in at build time.
#   API_UPSTREAM       host[:port] of the API (e.g. `api:8000`). When valid, writes
#                      /etc/caddy/conf.d/api-proxy.caddy: a same-origin reverse proxy for
#                      /api/*, /uploads/*, /share/* and the exact paths /health (API
#                      liveness for uptime monitors; /ready is deliberately NOT proxied)
#                      and /sitemap.xml (the sitemap index and its ?part=…&page=… pages,
#                      which must live at the site root).
#                      Unset or invalid: static files only (split-domain setups).
#   EDGE_MAX_BODY_SIZE Largest proxied request body (Caddy size, default 16MB). Keep it
#                      above the API's photo body cap (~11.06 MiB by default).
#   TRUSTED_PROXIES    Caddy `trusted_proxies static` ranges (`private_ranges` and/or
#                      CIDRs, space separated). When valid, writes
#                      /etc/caddy/global.d/trusted.caddy with right-to-left parsing
#                      (`trusted_proxies_strict`). Unset or empty: no proxy is trusted.
#   PUBLIC_APP_URL     Public origin of the app (e.g. `https://brew.example.org`). When
#                      valid, replaces the build-time origin ($BREWFORM_BUILD_PUBLIC_APP_URL,
#                      set by Dockerfile.web) in index.html (og:image, twitter:image) and
#                      robots.txt (Sitemap:). The rewrite always starts from pristine
#                      `*.orig` copies, so a restart with another value (or none) is correct.
#
# Mirror file: apps/web/public/config.js (the dev/build default for /config.js).
# Tested by scripts/ci/web-entrypoint.test.sh against the built image.
# ============================================================
set -eu

WEB_ROOT=/usr/share/caddy
CONFIG_FILE="$WEB_ROOT/config.js"
CONF_D=/etc/caddy/conf.d
GLOBAL_D=/etc/caddy/global.d
# Pristine copies of the files PUBLIC_APP_URL rewrites, kept outside the web root so
# Caddy never serves them.
ORIG_DIR=/var/lib/brewform-web
NL='
'

# Print one entrypoint log line.
log() {
	echo "[web-entrypoint] $*"
}

# Succeed when $1 is a single line that matches the extended regex $2.
matches() {
	case "$1" in
	*"$NL"*) return 1 ;;
	esac
	printf '%s' "$1" | grep -Eq "$2"
}

# Write the empty runtime config (the SPA falls back to its build-time API URL).
write_default_config() {
	printf 'globalThis.__BREWFORM_CONFIG__ = globalThis.__BREWFORM_CONFIG__ || {};\n' >"$CONFIG_FILE"
}

# VITE_API_URL -> /config.js. The allowlist excludes quotes, backslashes, whitespace and
# angle brackets, so the value cannot break out of the JS string literal.
apply_api_url() {
	if [ -z "${VITE_API_URL:-}" ]; then
		write_default_config
		log "no runtime VITE_API_URL set; using build-time default"
	elif matches "$VITE_API_URL" \
		'^(https?://[A-Za-z0-9._~:/?#@%!$&()*+,;=-]+|/[A-Za-z0-9._~:/?#@%!$&()*+,;=-]*)$'; then
		printf 'globalThis.__BREWFORM_CONFIG__ = { apiUrl: "%s" };\n' "$VITE_API_URL" >"$CONFIG_FILE"
		log "runtime VITE_API_URL applied: $VITE_API_URL"
	else
		write_default_config
		log "WARNING: VITE_API_URL is not a valid URL/path; ignoring it, using build-time default"
	fi
}

# API_UPSTREAM -> conf.d/api-proxy.caddy (same-origin reverse proxy), or static-only mode.
apply_api_upstream() {
	rm -f "$CONF_D/api-proxy.caddy"
	if [ -z "${API_UPSTREAM:-}" ]; then
		log "API proxy disabled (API_UPSTREAM not set); serving static files only"
		return 0
	fi
	if ! matches "$API_UPSTREAM" '^[A-Za-z0-9._-]+(:[0-9]{1,5})?$'; then
		log "WARNING: API_UPSTREAM is not a valid host[:port]; API proxy disabled, serving static files only"
		return 0
	fi
	# Caddy reads {$EDGE_MAX_BODY_SIZE:16MB} when it parses the Caddyfile; a blank value
	# counts as unset so the default applies.
	if [ -z "${EDGE_MAX_BODY_SIZE:-}" ]; then
		unset EDGE_MAX_BODY_SIZE
	fi
	cat >"$CONF_D/api-proxy.caddy" <<EOF
# Written by docker-web-entrypoint.sh because API_UPSTREAM is set.
# /health is an exact path (API liveness for uptime monitors); /ready is not proxied.
# /sitemap.xml is an exact path (the query, ?part=…&page=…, is passed through unchanged).
@api path /api/* /uploads/* /share/* /health /sitemap.xml
handle @api {
	request_body {
		max_size {\$EDGE_MAX_BODY_SIZE:16MB}
	}
	reverse_proxy $API_UPSTREAM {
		# Replace, never append: the API receives exactly one X-Forwarded-For entry and an
		# X-Real-IP, both equal to the client IP Caddy resolved right-to-left from
		# trusted_proxies, so it always counts the edge as one trusted hop
		# (TRUST_PROXY=hops, TRUST_PROXY_HOPS=1). Verified on Caddy 2.11.9: header_up
		# overrides the X-Forwarded-For value Caddy would set by default.
		header_up X-Forwarded-For {client_ip}
		header_up X-Real-IP {client_ip}
	}
}
EOF
	log "API proxy applied: /api/* /uploads/* /share/* /health /sitemap.xml -> $API_UPSTREAM"
}

# TRUSTED_PROXIES -> global.d/trusted.caddy, or trust no proxy.
apply_trusted_proxies() {
	rm -f "$GLOBAL_D/trusted.caddy"
	if [ -z "$(printf '%s' "${TRUSTED_PROXIES:-}" | tr -d ' ')" ]; then
		log "trusted proxies disabled (TRUSTED_PROXIES empty or not set); client IP is the connecting address"
		return 0
	fi
	if ! matches "$TRUSTED_PROXIES" '^[A-Za-z0-9_.:/ ]+$'; then
		log "WARNING: TRUSTED_PROXIES is not a list of ranges; trusted proxies disabled"
		return 0
	fi
	printf 'servers {\n\ttrusted_proxies static %s\n\ttrusted_proxies_strict\n}\n' \
		"$TRUSTED_PROXIES" >"$GLOBAL_D/trusted.caddy"
	log "trusted proxies applied (right-to-left): $TRUSTED_PROXIES"
}

# Succeed when $1 is an absolute http(s) origin with an optional path and no trailing
# slash. The allowlist has no `|`, `&` or `\`, so the value is safe in a `|` sed
# expression (pattern and replacement).
is_public_origin() {
	matches "$1" '^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[A-Za-z0-9._~%-]+)*$'
}

# Put the pristine build output of index.html and robots.txt back in place.
restore_public_files() {
	for f in index.html robots.txt; do
		if [ -f "$ORIG_DIR/$f.orig" ]; then
			cp "$ORIG_DIR/$f.orig" "$WEB_ROOT/$f"
		fi
	done
}

# PUBLIC_APP_URL -> index.html and robots.txt, always rewritten from the *.orig copies.
apply_public_url() {
	mkdir -p "$ORIG_DIR"
	for f in index.html robots.txt; do
		if [ ! -f "$ORIG_DIR/$f.orig" ] && [ -f "$WEB_ROOT/$f" ]; then
			cp "$WEB_ROOT/$f" "$ORIG_DIR/$f.orig"
		fi
	done
	restore_public_files

	public_url=${PUBLIC_APP_URL:-}
	public_url=${public_url%/}
	build_url=${BREWFORM_BUILD_PUBLIC_APP_URL:-}
	build_url=${build_url%/}
	if [ -z "$public_url" ]; then
		log "no runtime PUBLIC_APP_URL set; keeping the build-time public URL"
		return 0
	fi
	if ! is_public_origin "$public_url"; then
		log "WARNING: PUBLIC_APP_URL is not a valid http(s) origin; ignoring it, keeping the build-time public URL"
		return 0
	fi
	if [ -z "$build_url" ] || ! is_public_origin "$build_url"; then
		log "WARNING: the build-time public URL is unknown; PUBLIC_APP_URL not applied"
		return 0
	fi
	# Escape the BRE metacharacters the allowlist admits (only `.`) in the pattern.
	pattern=$(printf '%s' "$build_url" | sed 's/[.]/\\./g')
	for f in index.html robots.txt; do
		if [ -f "$ORIG_DIR/$f.orig" ]; then
			sed "s|$pattern|$public_url|g" "$ORIG_DIR/$f.orig" >"$WEB_ROOT/$f"
		fi
	done
	log "runtime PUBLIC_APP_URL applied: $public_url"
}

apply_api_url
apply_api_upstream
apply_trusted_proxies
apply_public_url

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
