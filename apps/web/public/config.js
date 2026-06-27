// Runtime configuration for the BrewForm SPA.
//
// This file is OVERWRITTEN at container start by docker-web-entrypoint.sh, which
// writes `globalThis.__BREWFORM_CONFIG__.apiUrl` from the container's $VITE_API_URL
// env var. When that env var is unset (and in local dev / `vite build`), this empty
// default is served and the app falls back to the build-time VITE_API_URL baked into
// the bundle. Keep this in sync with the entrypoint's "no env" branch.
globalThis.__BREWFORM_CONFIG__ = globalThis.__BREWFORM_CONFIG__ || {};
