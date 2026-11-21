#!/bin/sh
# ============================================================
# Completeness guard for the CI `publish` job (ci-image-publishing: "Images are published
# only after CI succeeds"). `publish` must start only after EVERY other job of the
# workflow succeeded, so every job id has to be listed in `.jobs.publish.needs` — except
# `publish` itself and jobs that run only on pull requests (their `if:` is exactly
# `github.event_name == 'pull_request'`; on a push they are skipped, and a skipped need
# would skip `publish`). It also refuses a `publish` condition that contains always(),
# failure() or cancelled(), which would bypass GitHub's implicit success() gate.
#
# Usage: scripts/ci/check-publish-needs.sh [workflow]   (default: .github/workflows/ci.yml)
# Prints each missing job id and exits 1 when any is missing; exits 0 otherwise.
# Requires: mikefarah yq v4 (preinstalled on GitHub-hosted Ubuntu runners).
# ============================================================
set -eu

WORKFLOW=${1:-.github/workflows/ci.yml}
# The literal `if:` text of pull-request-only jobs (the single quotes are part of it);
# yq reads it through strenv().
# shellcheck disable=SC2089,SC2090
PR_ONLY_IF="github.event_name == 'pull_request'"
# shellcheck disable=SC2090
export PR_ONLY_IF

if [ ! -f "$WORKFLOW" ]; then
	echo "check-publish-needs: $WORKFLOW not found" >&2
	exit 1
fi
if [ "$(yq '.jobs | has("publish")' "$WORKFLOW")" != "true" ]; then
	echo "check-publish-needs: $WORKFLOW has no publish job" >&2
	exit 1
fi

jobs=$(yq -r '.jobs | to_entries | .[]
	| select(.key != "publish" and ((.value.if // "") != strenv(PR_ONLY_IF)))
	| .key' "$WORKFLOW")
needs=$(yq -r '(.jobs.publish.needs // []) | [.] | flatten | .[]' "$WORKFLOW")
condition=$(yq -r '.jobs.publish.if // ""' "$WORKFLOW")

status=0
for job in $jobs; do
	if ! printf '%s\n' "$needs" | grep -qx "$job"; then
		echo "missing from jobs.publish.needs in $WORKFLOW: $job"
		status=1
	fi
done
case "$condition" in
*always\(\)* | *failure\(\)* | *cancelled\(\)*)
	echo "jobs.publish.if must not bypass the success() gate: $condition"
	status=1
	;;
esac

if [ "$status" -eq 0 ]; then
	echo "ok - jobs.publish.needs lists every job: $(printf '%s' "$needs" | tr '\n' ' ')"
fi
exit "$status"
