# Tasks — f05-in-app-notifications

> Self-contained checklist. Each task carries its absolute file path, the exact shape expected, the docblock skeleton to use, and the test cases to add. A fresh-context agent should be able to execute T1 → T46 without re-investigation.

## Phase 1: Shared schema + DB enum + migration

- [x] **T1**: Extend `notificationTypeEnum` in `/Users/arda/projects/BrewForm/packages/db/src/schema.ts` (current line ~945) with `'follow'`, `'like'`, `'comment'` after `'mention'`. Replace the existing docblock above the enum with the R1 skeleton from `design.md` (the section noting 4 active values, deferred `badge`/`system`, one-way `ADD VALUE` door).

- [x] **T2**: Update the 5 notification columns in `/Users/arda/projects/BrewForm/packages/db/src/schema.ts` (current lines ~116-120): rename TS properties `newFollower` → `notifyNewFollower` etc. and DB columns `new_follower` → `notify_new_follower` etc. (see the R1 column block). Run `make db-generate` — Drizzle Kit's interactive prompt will ask to confirm each column rename; answer YES for all 5 (NOT drop+create — that destroys data). Inspect the generated SQL under `packages/db/migrations/<timestamp>_<name>.sql`: it should contain 3 `ALTER TYPE ... ADD VALUE` (enum) and 5 `ALTER TABLE user_preferences RENAME COLUMN ... TO notify_...` statements. Do NOT hand-edit the generated file (AGENTS.md rule). If the shape is wrong, fix the schema and re-generate. Then run `make db-migrate` to apply.

- [x] **T3**: Run `make test-db-provision` to sync the `brewform_test` DB (CI mirror — recreates schemas and re-seeds). Idempotent.

- [x] **T4**: Flatten `UserPreferencesSchema` in `/Users/arda/projects/BrewForm/packages/shared/src/schemas/user.ts` (current lines ~13-33): remove the nested `emailNotifications` object; expose 5 flat top-level fields `notifyNewFollower`, `notifyRecipeLiked`, `notifyRecipeCommented`, `notifyFollowedUserPosted`, `notifyMentionedInComment` — each `z.boolean().default(true)`. Use the R2 skeleton verbatim. Update the file's top docblock if it mentions `emailNotifications`.

- [x] **T5**: Flatten `SelfPreferencesSchema` in `/Users/arda/projects/BrewForm/packages/shared/src/schemas/responses/user.ts` (current lines ~46-61): remove the nested `emailNotifications` object; expose 5 flat top-level `notify*` fields (no `.default()` on response schemas — they describe persisted rows, defaults belong on the input). Use the R3 skeleton verbatim. Add a docblock above this schema explaining the F05 flatten and that the F04 latent `mentionedInComment` omission is now structurally fixed.

- [x] **T6**: Flatten the `UserPreferences` interface in `/Users/arda/projects/BrewForm/packages/shared/src/types/user.ts` (current lines ~41-54): remove the nested `emailNotifications` object; add 5 flat top-level `notify*` fields (including `notifyMentionedInComment`). Use the R5 skeleton verbatim. Add a docblock above the interface noting the F05 flatten.

- [x] **T7**: Rename the 5 notification fields in `UserPreferencesOutputSchema` in `/Users/arda/projects/BrewForm/packages/shared/src/schemas/responses/preference.ts` (current lines ~14-30): `newFollower` → `notifyNewFollower`, `recipeLiked` → `notifyRecipeLiked`, `recipeCommented` → `notifyRecipeCommented`, `followedUserPosted` → `notifyFollowedUserPosted`, `mentionedInComment` → `notifyMentionedInComment`. Use the R4 skeleton verbatim. Update the docblock at the top of this file (lines 7-9) to reflect that request and response now share the same flat `notify*` shape (the F04 asymmetry is gone).

- [x] **T8**: Update `/Users/arda/projects/BrewForm/packages/shared/src/schemas/user.test.ts`:
  - Rename every `emailNotifications` reference to flat `notify*` field assertions (no nested object).
  - Existing assertions to update (around lines 15, 19, 21, 25, 26, 51, 61):
    - "UserPreferencesSchema defaults all 5 flags to true" → assert `parse({}).notifyNewFollower === true` (and 4 siblings)
    - "Partial input: `{ emailNotifications: { newFollower: false } }` parses with the other 4 defaulting to true" → assert `{ notifyNewFollower: false }` parses with the other 4 still defaulting to `true`
    - "`mentionedInComment` default and round-trip" → `notifyMentionedInComment`
    - "Full object acceptance" → flat full object
  - Add an assertion that the schema treats `{ emailNotifications: { ... } }` as no-op (Zod default strips unknown keys, so the parsed result has the `emailNotifications` field undefined and the 5 `notify*` fields defaulted to `true`); assert the parsed output's 5 `notify*` fields are all `true` despite the legacy input shape.

- [x] **T9**: Update `/Users/arda/projects/BrewForm/packages/shared/src/schemas/responses/user.test.ts` (current line ~44):
  - Replace the `emailNotifications: { newFollower, recipeLiked, recipeCommented, followedUserPosted }` (4-field nested) happy-path payload with a flat `preferences: { unitSystem, theme, ..., notifyNewFollower, notifyRecipeLiked, notifyRecipeCommented, notifyFollowedUserPosted, notifyMentionedInComment }` payload (5 flat flags, no nest).
  - Add an assertion that `notifyMentionedInComment` is present in a successful parse (F04 latent bug regression guard).
  - Update the null-preferences test: `preferences: null` still parses.

- [x] **T10**: Update `/Users/arda/projects/BrewForm/packages/shared/src/schemas/responses/output-schema-acceptance.pbt.test.ts:568` (property-based):
  - Find the `emailNotifications: fc.record({ newFollower, recipeLiked, recipeCommented, followedUserPosted })` arbitrary.
  - Replace with 5 flat `notify*` fields on the outer `preferences` fc.record — including `notifyMentionedInComment` (must be `fc.boolean()` for parity with the other 4).
  - The `preferences` object is `.nullable()` — preserve that wrapper.

- [x] **T11**: Update `/Users/arda/projects/BrewForm/packages/shared/src/schemas/responses/preference.test.ts`:
  - The existing flat-row rejection test (line ~57-72) asserts that `UserPreferencesOutputSchema` rejects a nested `emailNotifications` object as input to the flat schema. Keep the spirit; update field-name references to `notify*`.
  - The existing missing-`mentionedInComment` rejection test (line ~33-55) becomes missing-`notifyMentionedInComment`. Update accordingly.
  - Add a positive assertion that all 5 flat `notify*` fields round-trip.

## Phase 2: API preference + user model

- [x] **T12**: Update `/Users/arda/projects/BrewForm/apps/api/src/modules/preference/index.ts` PATCH handler (current lines ~83-104): remove the `if (body.emailNotifications !== undefined) { flatData.X = body.emailNotifications.X; ... }` wrapper. Replace with 5 direct per-field copies as in the R6 skeleton. The `PreferenceUpdate` type (`Partial<typeof userPreferences.$inferInsert>`) auto-adapts — `$inferInsert` now has `notifyNewFollower` etc. Add a docblock above the flatten block explaining that the F05 flatten turned the nested unwrap into an identity-copy per field.

- [x] **T13**: Update `/Users/arda/projects/BrewForm/apps/api/src/modules/user/model.ts:findById` (current lines ~36-41): the `emailNotifications: { 4 fields }` nest becomes a flat `preferences: { ...5 flat notify* fields... }` object. Use the R7 skeleton verbatim. Add a docblock above the projection explaining that `/me` and `/preferences` now share the same flat shape (the F04 asymmetry is gone, the F04 latent `mentionedInComment` omission is structurally fixed).

- [x] **T14**: The OpenAPI `requestBody` on the PATCH `/preferences` route auto-adapts via `jsonRequestBody(UserPreferencesSchema)` from `/Users/arda/projects/BrewForm/apps/api/src/utils/openapi/index.ts`. Since `UserPreferencesSchema` is now flat, the auto-generated JSON schema is flat with `notify*` fields. No manual schema object needed; do NOT use `resolver()` for request bodies (AGENTS.md rule). After running the API, hit `GET /api/v1/openapi.json` (via `make dev` or a test) and spot-check that the PATCH `/preferences` request body shows flat `notify*` keys (no `emailNotifications` nest).

- [x] **T15**: Update `/Users/arda/projects/BrewForm/apps/api/src/modules/user/model.test.ts:56-59`:
  - Current assertion: `expect(prefs.emailNotifications.newFollower).toBe(false)` (and 3 siblings).
  - Replace with: `expect(prefs.notifyNewFollower).toBe(false)` and 4 siblings — 5 flat `notify*` fields on `preferences` directly (no nested `emailNotifications` object).
  - Add an assertion for `prefs.notifyMentionedInComment` (was missing — F04 latent bug regression guard).

- [x] **T16**: Update `/Users/arda/projects/BrewForm/apps/api/src/modules/preference/model.test.ts`:
  - The DB-backed round-trip currently uses `unitSystem` / `theme` / `temperatureUnit` in its upsert + read assertions.
  - Add 1 new assertion: toggling `notifyMentionedInComment` to `false` via `upsert` round-trips through `findByUserId` (asserting the renamed column persists the value). This was missing in F04.
  - Update any explicit `emailNotifications` references in this test (the round-trip likely avoids the namespace since it speaks DB row shape — but verify).

- [x] **T17**: Update `/Users/arda/projects/BrewForm/apps/api/src/modules/preference/index.test.ts`:
  - Currently 401-only (pre-auth route guard tests). Keep those as-is — they don't touch the request body shape.
  - If any test references `emailNotifications` in a mocked request body, rename to flat `notify*` fields.
  - Ponytail: do NOT add a full happy-path PATCH test if the repo's existing pattern doesn't include DB-backed route tests for this module. The persistence coverage is in T16; the request schema is unit-tested in T8.

- [x] **T18**: Update `/Users/arda/projects/BrewForm/apps/api/src/modules/preference/service.test.ts`:
  - Service entry/exit/error log-spy tests. Update any mocked prefs payload referencing `emailNotifications` to use flat `notify*` fields. The log shape assertions themselves shouldn't change unless they explicitly log the prefs object (per AGENTS.md, logs exclude payloads — so probably no change needed; verify).

- [x] **T19**: `make check-api` passes (type-check).

## Phase 3: Notification fan-out (API)

- [x] **T20**: Add `findNotifyTarget(userId: string)` to `/Users/arda/projects/BrewForm/apps/api/src/modules/notification/model.ts`. Pattern: copy the `users` LEFT JOIN `userPreferences` shape already used by `findMentionTargets`, but for a single recipient by `userId`. Returns `{ id, username, prefs } | null` (`prefs` is `userPreferences.$inferSelect | null`). Use the R9 docblock skeleton verbatim. Add a docblock.

- [x] **T21**: Update `/Users/arda/projects/BrewForm/apps/api/src/modules/notification/service.ts`:
  - Extend the import from `../../utils/notify/index.ts` to include `notifyNewFollower`, `notifyRecipeLiked`, `notifyRecipeCommented` alongside `notifyMentioned`.
  - Update the `deps` export: `export const deps = { model, notifyMentioned, notifyNewFollower, notifyRecipeLiked, notifyRecipeCommented };`.
  - Update the existing `createMentionNotifications` (line ~104): `if (target.prefs?.mentionedInComment === false) continue;` becomes `if (target.prefs?.notifyMentionedInComment === false) continue;`. Everything else in the F04 function is unchanged.
  - Update the file's top docblock (lines 1-8): change "F04 — @mention notifications" → "F04 + F05 notifications (`mention`, `follow`, `like`, `comment`)". Update the per-line flow description if needed.

- [x] **T22**: Add `createFollowNotification` to `/Users/arda/projects/BrewForm/apps/api/src/modules/notification/service.ts` — use the R10 `createFollowNotification` skeleton verbatim (full JSDoc + structured-logging entry/exit/error logs + per-target catch-log-continue + the `followerId === followingId` self-follow skip + the gate `target.prefs?.notifyNewFollower === false` + the record shape `{ userId, type: 'follow', actorId, referenceId: null, referenceType: 'actor', metadata: { followerUsername } }` + the `deps.notifyNewFollower` call).

- [x] **T23**: Add `createLikeNotification` to the same file. Skeleton: same as `createFollowNotification` but:
  - params: `{ likerId, likerUsername, recipeAuthorId, recipeId, recipeSlug, recipeTitle }`
  - skip if `likerId === recipeAuthorId`
  - gate: `target.prefs?.notifyRecipeLiked === false`
  - record: `{ userId: recipeAuthorId, type: 'like', actorId: likerId, referenceId: recipeId, referenceType: 'recipe', metadata: { recipeSlug, recipeTitle } }`
  - email: `deps.notifyRecipeLiked({ recipeAuthorId, likerUsername, recipeTitle, recipeSlug })`
  - JSDoc mirrors R10's like-specific flow description.

- [x] **T24**: Add `createCommentNotification` to the same file. Skeleton mirrors T23 but:
  - params: `{ commenterId, commenterUsername, recipeAuthorId, recipeId, recipeSlug, recipeTitle, commentId }`
  - skip if `commenterId === recipeAuthorId`
  - gate: `target.prefs?.notifyRecipeCommented === false`
  - record: `{ userId: recipeAuthorId, type: 'comment', actorId: commenterId, referenceId: commentId, referenceType: 'comment', metadata: { recipeSlug, recipeTitle } }`
  - email: `deps.notifyRecipeCommented({ recipeAuthorId, commenterUsername, recipeTitle, recipeSlug })`
  - JSDoc explicitly notes this is distinct from `createMentionNotifications` (recipe-author path vs each `@username`).

- [x] **T25**: Wire `createFollowNotification` into `/Users/arda/projects/BrewForm/apps/api/src/modules/follow/service.ts` after the follow relationship is created (current line ~37 is where `notifyNewFollower` is called; colocate the new fan-out either before or after the existing email call). Fire-and-forget: `createFollowNotification({...}).catch((err) => logger.error({err, followerId: userId, followingId: targetUserId}, 'createFollowNotification failed'))`. Use the R12 follow skeleton. Update the docblock on the modified function noting the F05 fan-out addition.

- [x] **T26**: Wire `createLikeNotification` into `/Users/arda/projects/BrewForm/apps/api/src/modules/recipe/service.ts:toggleLike` (current line ~567, inside `if (result.liked && recipe.authorId !== userId)` block at line ~577 — the `notifyRecipeLiked` call already lives there). Colocate the new `createLikeNotification` call beside the existing `notifyRecipeLiked` call. Fire-and-forget with `.catch(err => logger.error(...))`. Use the R12 like skeleton. Update the docblock on `toggleLike` noting the F05 fan-out.

- [x] **T27**: Wire `createCommentNotification` into `/Users/arda/projects/BrewForm/apps/api/src/modules/comment/service.ts:runCommentNotificationSideEffects` (current line ~146). The function already wraps `notifyRecipeCommented` in an IIFE with try-catch at line ~163 — colocate the new `createCommentNotification` call inside the same `if (commenterId !== recipeAuthorId)` block. Fire-and-forget. DO NOT touch the existing `createMentionNotifications` invocation at line ~178 — it's a separate fan-out path for `@mentioned` users. Use the R12 comment skeleton. Update the docblock on `runCommentNotificationSideEffects` noting the parallel F05 fan-out.

- [x] **T28**: Update `/Users/arda/projects/BrewForm/apps/api/src/utils/notify/index.ts` — rename every `recipient.prefs.X` access to `recipient.prefs.notifyX`. The 5 access sites are listed in the R8 table. Also rename any local variable / mock prefs object in this file referencing `newFollower` etc. Do NOT rename the helper functions themselves (`notifyNewFollower` stays `notifyNewFollower` — the function name is channel-agnostic already). Add a docblock at the top of the file noting the F05 column rename.

- [x] **T29**: Update `/Users/arda/projects/BrewForm/apps/api/src/modules/notification/service.test.ts`:
  - Existing `createMentionNotifications` suite (current line ~166-193): rename every `prefs: { mentionedInComment: ... }` mock/check to `prefs: { notifyMentionedInComment: ... }`. Every assertion touching `prefs.mentionedInComment` becomes `prefs.notifyMentionedInComment`. Test logic is otherwise unchanged.
  - Add 3 new `describe` suites, one per new creator (`createFollowNotification`, `createLikeNotification`, `createCommentNotification`), each with these `it` blocks:
    - "gate-skip": `prefs: { notifyX: false }` → `deps.model.create` NOT called, `deps.notifyX` NOT called
    - "null-prefs-enabled": `findNotifyTarget` returns `{ id, username, prefs: null }` → record + email BOTH called
    - "actor-self-skip": actorId === recipientId → no record, no email
    - "recipe-author-skip" (like and comment only): likerId/commenterId === recipeAuthorId → no record, no email (follow suite skips this test — N/A)
    - "record-then-email-ordering": assert `deps.model.create` is awaited before `deps.notifyX` (use `assertSpyCalls` order OR stub both and check invocation order)
    - "matched-call-shape": assert `deps.model.create` called with exact `{ userId, type, actorId, referenceId, referenceType, metadata }` shape (objectContaining); assert `deps.notifyX` called with exact `{ ... }` per the helper's signature
    - "create-throws-logs-and-continues": stub `deps.model.create` to throw → `logger.error` called, function returns (does not throw); for the single-recipient creators, there's no "next recipient" to continue to — just assert log-and-return
    - "target-not-found": `findNotifyTarget` returns `null` → no record, no email, logs debug and returns (createFollowNotification only — the others might assume the target exists; on `null`, log debug and return)

- [x] **T30**: Update `/Users/arda/projects/BrewForm/apps/api/src/modules/notification/model.test.ts` (if it exists — glob first; if absent, the model helpers are exercised via the service test and you can skip this task and add a note). Otherwise:
  - Add a `describe('findNotifyTarget')` suite: user-with-prefs / user-without-prefs (`prefs: null`) / user-not-found (`null`) / user-soft-deleted (`null`).

- [x] **T31**: Update `/Users/arda/projects/BrewForm/apps/api/src/modules/follow/service.test.ts`:
  - Add an `it` asserting `createFollowNotification` is invoked after follow creation with the right param shape (mock the `notification/service` module's `createFollowNotification` and `assertSpyCalls`).
  - Add an `it` asserting `createFollowNotification` is NOT invoked when the follow already existed (idempotent re-follow).

- [x] **T32**: Update `/Users/arda/projects/BrewForm/apps/api/src/modules/recipe/service.test.ts` (find the `toggleLike` `describe` block):
  - Add `it`: like ON + author ≠ liker → `createLikeNotification` invoked with `{ likerId, likerUsername, recipeAuthorId, recipeId, recipeSlug, recipeTitle }`
  - Add `it`: like OFF → `createLikeNotification` NOT invoked
  - Add `it`: like ON + author === liker (self-like) → `createLikeNotification` NOT invoked

- [x] **T33**: Update `/Users/arda/projects/BrewForm/apps/api/src/modules/comment/service.test.ts` (find the `runCommentNotificationSideEffects` block OR the comment-create test that exercises it):
  - Add `it`: commenter ≠ author → `createCommentNotification` invoked with full param shape
  - Add `it`: commenter === author (self-comment) → `createCommentNotification` NOT invoked
  - Add `it` regression: `createMentionNotifications` STILL fires for `@mentioned` users regardless of commenter/author relationship (unchanged — sanity check F04 path)

- [x] **T34**: Update `/Users/arda/projects/BrewForm/apps/api/src/utils/notify/notify.test.ts`:
  - Rename every `prefs: { newFollower: ... }` / `prefs: { recipeLiked: ... }` / etc. mock/check to use the 5 `notify*` field names. 5 helper suites' gate-skip tests need updating.

- [x] **T35**: `make check-api && make test-api` pass.

## Phase 4: Web UI

- [x] **T36**: Update `/Users/arda/projects/BrewForm/apps/web/src/pages/settings/SettingsPage.tsx`:
  - `toUserPreferences()` adapter (lines ~24-31): drop the nested `emailNotifications: { ... }` build step. The form state's 5 prefs live directly on the prefs object. Add a docblock on `toUserPreferences` noting the F05 flat shape and that the F04 nest-build step is gone.
  - 5 `NotificationToggle` components (lines ~259-307): each toggle:
    - read `prefs.notifyNewFollower` (was `prefs.emailNotifications.newFollower`) — and 4 siblings
    - on toggle, set `{ ...prefs, notifyNewFollower: v }` (was `emailNotifications: { ...prefs.emailNotifications, newFollower: v }`) — and 4 siblings
  - `savePreferences()` (lines ~79-86): sends `{ ...prefs }` flat (the whole prefs object) OR `{ notifyNewFollower, notifyRecipeLiked, ... }` explicitly — either works since `prefs` is now flat. Pick the explicit form for clarity.
  - Section header i18n key at line ~260: `settings.emailNotifications` → `settings.notifications` (the latter already exists at en.json line 247 / tr.json line 247).

- [x] **T37**: Update `/Users/arda/projects/BrewForm/apps/web/src/components/layout/NotificationItem.tsx`:
  - Find the `if (notification.type === 'mention')` branch (line ~61).
  - Replace with a `switch (notification.type)` returning per-type JSX:
    - `'mention'` (existing): keep the current rendering
    - `'follow'`: `<PersonIcon />` + `<Trans i18nKey="notifications.follow" values={{ actorUsername }} />` + link `<Link to={`/u/${actorUsername}`}>`
    - `'like'`: `<HeartIcon />` + `<Trans i18nKey="notifications.like" values={{ actorUsername, recipeTitle }} />` + link `<Link to={`/recipes/${recipeSlug}`}>`
    - `'comment'`: `<ChatIcon />` + `<Trans i18nKey="notifications.comment" values={{ actorUsername, recipeTitle }} />` + link `<Link to={`/recipes/${recipeSlug}#${commentId}`}>`
    - `default`: fall back to `t('notifications.mentionGeneric', { actorUsername })` (forward-compat with future enum values — no crash).
  - Parse metadata JSON once at the top of the component: `const meta = JSON.parse(notification.metadata ?? '{}')`; extract `recipeSlug`, `recipeTitle`, `actorUsername`, `commentId` from it.
  - Extract the icon-per-type to a small inline helper or const map. Add typed docblocks on the new helpers.

- [x] **T38**: Add an `All` / `Unread` filter to `/Users/arda/projects/BrewForm/apps/web/src/pages/notifications/NotificationListPage.tsx`:
  - Add `const [filter, setFilter] = useState<'all' | 'unread'>('all');` near the top of the component (or the existing state for the list — adapt to the component's structure).
  - On filter change, call `notificationApi.list({ unreadOnly: filter === 'unread' })` (or the existing list call shape — match it). Re-fetch on change.
  - Render a single toggle UI (two buttons or a toggle pill) labeled with existing i18n (en: "All" / "Unread" — already exist at lines 334-335 of en.json: `notifications.unread`; check `notifications.all` — if missing, add it in T40).
  - Empty-state rendering unchanged.
  - Add a docblock on the new state explaining the F05 filter.

- [x] **T39**: Update `/Users/arda/projects/BrewForm/packages/shared/src/i18n/en.json` and `tr.json` (parity required):
  - Add `notifications.follow` = `"{actorUsername} started following you"` (en) / `"{"actorUsername"} seni takip etmeye başladı"` (tr)
  - Add `notifications.like` = `"{actorUsername} liked your recipe {recipeTitle}"` (en) / `"{"actorUsername"} tarifini beğendi: {recipeTitle}"` (tr)
  - Add `notifications.comment` = `"{actorUsername} commented on {recipeTitle}"` (en) / `"{"actorUsername"} tarifine yorum yaptı: {recipeTitle}"` (tr)
  - If `notifications.all` doesn't exist at line ~337, add it = `"All"` (en) / `"Tümü"` (tr) for the filter pill in T38. Check both files first.
  - Remove `settings.emailNotifications` (line 324 in both files). The section header `settings.notifications` (line 247) is the replacement.
  - Verify en/tr key-count parity after the change (the repo enforces this somewhere — likely `packages/shared/src/i18n/i18n-parity.test.ts` or similar; run it).

- [x] **T40**: Update `/Users/arda/projects/BrewForm/apps/web/src/components/layout/NotificationItem.test.tsx`:
  - Add `it` for `follow`: render with `{ type: 'follow', actorId, actorUsername: 'alice', metadata: '{"followerUsername":"alice"}' }` → assert text contains "alice started following you", assert link `/u/alice`. (Note: the metadata JSON for follow contains `{ followerUsername }` per R10 — adjust to assert against that shape.)
  - Add `it` for `like`: render with `{ type: 'like', ..., metadata: '{"recipeSlug":"foo","recipeTitle":"Bar"}' }` → assert text contains "Bar" (recipeTitle interpolation), assert link `/recipes/foo`
  - Add `it` for `comment`: render with `{ type: 'comment', ..., metadata: '{"recipeSlug":"foo","recipeTitle":"Bar"}', referenceId: 'c-123' }` → assert text contains "Bar", assert link `/recipes/foo#c-123`
  - Add `it` for unknown type (e.g. `'futureType'`): assert renders the `mentionGeneric` fallback without crashing
  - Update existing `mention` test if it references `emailNotifications` (unlikely — this is the feed UI, not SettingsPage)

- [x] **T41**: Update `/Users/arda/projects/BrewForm/apps/web/src/pages/notifications/NotificationListPage.test.tsx`:
  - Add `it`: initial render calls `notificationApi.list` with `unreadOnly: false` (or whatever the default-shape call asserts today)
  - Add `it`: clicking "Unread" calls `notificationApi.list` with `unreadOnly: true`; only unread items rendered (mock the api to return distinct read vs unread payloads)
  - Add `it`: clicking "All" reverts to `unreadOnly: false`
  - Update existing test mocks if they reference old prefs shape — unlikely but verify

- [x] **T42**: Update `/Users/arda/projects/BrewForm/apps/web/src/pages/settings/SettingsPage.test.tsx`:
  - Mock i18n map (line ~105): drop `'settings.emailNotifications'`; add `'settings.notifications'` if missing; the 5 `settings.notif.*` keys stay (they were already channel-agnostic — rename if they reference `emailNotifications` in their values, unlikely).
  - Loader data shape: prefs are now flat — `prefs.notifyNewFollower` (was `prefs.emailNotifications.newFollower`).
  - PATCH payload assertion (line ~365): after toggling `notifyMentionedInComment` OFF, the PATCH payload should be `{ notifyMentionedInComment: false }` (flat) — was `{ emailNotifications: expect.objectContaining({ mentionedInComment: false }) }`.
  - Add an assertion that all 5 toggles round-trip (newly include `notifyMentionedInComment`).

- [x] **T43**: `make check-web && make test-specific filter=apps/web` pass. `make fmt` applied.

## Phase 5: Verification + docs housekeeping

- [x] **T44**: Run `make db-generate && make db-migrate && make db-seed` — full DB setup is idempotent. If `packages/db/src/seed.ts` references the old column names (search for `newFollower` / `new_follower`), update to the new `notify*` names; per AGENTS.md seed idempotency rules, the new seed should use `onConflictDoNothing` per existing patterns. Re-run `make test-db-provision` to sync the test DB.

- [x] **T45**: Add a migration data-preservation test — verify the F05 migration did NOT wipe existing prefs rows. Pattern: insert a row with `notify_new_follower = false` (the new column) into a test fixture, run the model's `findByUserId`, assert the value is `false`. If the seed already sets any `notify*` flag to a non-default, assert the value carries through `make test-db-provision` (which re-applies the migration to the test DB). If the migration was data-destroying instead of `RENAME COLUMN`, this test will fail — which is the point.

- [x] **T46**: `make check && make lint && make test` all green. `make fmt` applied. Pre-commit hook (`make setup-hooks`) passes locally. The OpenAPI introspection coverage test `/Users/arda/projects/BrewForm/apps/api/src/routes/openapi.coverage.test.ts` passes — the PATCH `/preferences` route still has `describeRoute()` metadata, no orphan tag, the request body's auto-generated schema reflects the flat `notify*` fields.

- [x] **T47**: Update `/Users/arda/projects/BrewForm/plans/F05-in-app-notifications.md`:
  - Prepend a banner to the top (after line 1, before the 2026-07-13 correction note): `> **✅ Shipped via OpenSpec change \`f05-in-app-notifications\` (2026-MM-DD).**` (replace MM-DD with the actual ship date).
  - Add a one-line note below the banner: `> The implemented shape is Option C — flat top-level \`notify*\` schema fields + \`notify_\`-prefixed DB columns (the 11-point What Changes in the OpenSpec \`proposal.md\` is the source of truth; the preface below is preserved as the historical 2026-07-13 audit context).`
  - Do NOT delete the existing correction note (lines 3-22) — it's historical context.

- [x] **T48**: Update `/Users/arda/projects/BrewForm/plans/F29-weekly-email-digest.md` (forward-compat note for a future plan that would otherwise blindly add a nested `weeklyDigest` to `emailNotifications`):
  - Find lines 11, 27, 47, 84, 113 (5 references to `emailNotifications`).
  - Prepend a banner at the top: `> **⚠️ Forward-compat note (F05, 2026-MM-DD):** The \`emailNotifications\` namespace was flattened and renamed by the F05 \`f05-in-app-notifications\` OpenSpec change. References to "add \`weeklyDigest\` to \`emailNotifications\`" below should be read as "add a flat top-level \`notifyWeeklyDigest\` boolean column on \`user_preferences\` (per the F05 pattern)." Do NOT introduce a new nested namespace; align with F05's flat \`notify*\` convention.`
  - Do NOT rewrite the body of F29 — just the banner at the top.

- [x] **T49**: Final commit — `git status` / `git diff` inspection; stage only the intended files (the OpenSpec change artifacts, the source edits, the tests, the updated plans/F05 and F29 docs). Commit message format per repo style (`feat: F05 in-app notification center — follow/like/comment fan-out, flat notify* preference rename`). Do NOT push unless explicitly asked.

---

**Total: 49 tasks across 5 phases.** Sequence: T1 → T49 in order. Each phase is independently runnable after the prior phase completes. Phase 5's verification (T46) is the gate before commit.