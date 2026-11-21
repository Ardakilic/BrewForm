# PR notes (collected per group for task 22.4)

## Group 13 (web action results)

- Deleted `apps/web/src/components/user/FollowButton.exploration.test.ts` and `FollowButton.preservation.test.ts`: they tested a hand-written copy of an old follow state machine (the D99.13 mirror-test pattern), and their premise that a 409 is an error contradicts the now idempotent follow. The real `FollowButton.test.tsx` covers the component.
- A dead session during a background action (resource routes) now shows the `error.unauthorized` toast instead of redirecting to `/login?next=/resources/...`.
