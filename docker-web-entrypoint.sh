#!/bin/sh
set -e

# Generate the SPA's runtime configuration from the container environment.
#
# When $VITE_API_URL is set it OVERRIDES the build-time value baked into the JS
# bundle by Vite — so one prebuilt image can be retargeted at any deployment
# (e.g. point it at a different API origin) without a rebuild. When unset, an
# empty config is emitted and the app falls back to the build-time default.
#
# Mirror file: apps/web/public/config.js (the dev/build default).
CONFIG_FILE=/usr/share/caddy/config.js

write_default() {
	printf 'globalThis.__BREWFORM_CONFIG__ = globalThis.__BREWFORM_CONFIG__ || {};\n' >"$CONFIG_FILE"
}

if [ -n "${VITE_API_URL:-}" ]; then
	# Validate before embedding the value in the JS string literal below. Accept only an
	# absolute http(s) URL or a root-relative path built from URL-safe characters; this
	# allowlist excludes quotes, backslashes, whitespace and angle brackets, so the value
	# cannot break out of the string or inject code into /config.js.
	if printf '%s' "$VITE_API_URL" |
		grep -Eq '^(https?://[A-Za-z0-9._~:/?#@%!$&()*+,;=-]+|/[A-Za-z0-9._~:/?#@%!$&()*+,;=-]*)$'; then
		printf 'globalThis.__BREWFORM_CONFIG__ = { apiUrl: "%s" };\n' "$VITE_API_URL" >"$CONFIG_FILE"
		echo "[web-entrypoint] runtime VITE_API_URL applied: $VITE_API_URL"
	else
		write_default
		echo "[web-entrypoint] WARNING: VITE_API_URL is not a valid URL/path; ignoring it, using build-time default"
	fi
else
	write_default
	echo "[web-entrypoint] no runtime VITE_API_URL set; using build-time default"
fi

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
