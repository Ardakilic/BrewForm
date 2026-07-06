## Context

Wave 3 of the debt roadmap bundles three frontend-structure items (`D36` + `D37` + `D40`) into one
change because the `ROADMAP.md` explicitly sequences them: D36 dedupes before D40 translates (each
string touched once), and D37 settles error pages before D40 localizes them. The research confirmed
the sequencing is correct — and surfaced several drifts from the original plans that this design
resolves.

### Architecture — the three sub-changes and their sequencing

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  WAVE 3 — three sequenced sub-changes, one PR                                │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  D36 — Extract duplicated UI (LAND FIRST)                                    │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  Cluster 1: HomePage RecipeCard                                        │  │
│  │    delete local RecipeCard (lines 103-137)                              │  │
│  │    import shared from components/recipe-list/                           │  │
│  │    → adds currentVersion badge row (behavioural improvement)            │  │
│  │                                                                        │  │
│  │  Cluster 2: BanDialog + useBanUser                                     │  │
│  │    new components/admin/BanDialog.tsx (controlled, t()-using)           │  │
│  │    new hooks/useBanUser.ts (state machine + adminApi calls)             │  │
│  │    AdminUsersPage: replace inline (lines 27-33, 72-94, 324-369)         │  │
│  │      onSuccess → setUsers(prev.map(...))                                │  │
│  │    AdminUserDetailPage: replace inline (lines 20-25, 49-67, 280-325)    │  │
│  │      onSuccess → setUser(prev ? {...prev, isBanned} : prev)             │  │
│  │      ADD error-display element (page has none — silent-swallow root)    │  │
│  │                                                                        │  │
│  │  Cluster 3: Section/Field form primitives                              │  │
│  │    new components/form/{Section,Field,index}.tsx                        │  │
│  │    RecipeCreatePage: delete local (lines 535, 545), import shared       │  │
│  │    RecipeEditPage: delete EditSection/EditField (lines 462, 471),       │  │
│  │      rename call sites, import shared (PLAN DRIFT: EditPage HAS copies) │  │
│  │                                                                        │  │
│  │  Stretch: AdminRecipesPage table → NOT extracting (table, not card)     │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  D37 — Consolidate error pages (LAND SECOND)                                 │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  ErrorPage.tsx → canonical module                                      │  │
│  │    merge NotFoundPage.tsx's <SEOHead noIndex> into NotFoundPage export  │  │
│  │    add <SEOHead> to base ErrorPage (all variants get noIndex)           │  │
│  │    delete ForbiddenPage export (no trigger — Decision 3)                │  │
│  │    un-export base ErrorPage (internal helper — satisfies "no dead")     │  │
│  │  NotFoundPage.tsx → DELETE                                              │  │
│  │  router.tsx:7 → import from ErrorPage.tsx                               │  │
│  │  ErrorBoundary.tsx →                                                    │  │
│  │    delegate 404 branch to <NotFoundPage /> (kills 3rd prose copy)       │  │
│  │    add if (error.status >= 500) return <ServerErrorPage />              │  │
│  │    add t() to generic fallback chrome (Go Home/Reload/Oops)             │  │
│  │  ErrorPage.test.tsx → remove ForbiddenPage, add SEOHead assertions      │  │
│  │  ErrorBoundary.test.tsx → NEW (throw 404/500 from test loaders)         │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  D40 — Complete i18n (LAND THIRD)                                            │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  Locale files (en.json + tr.json):                                      │  │
│  │    wire existing unused admin.* nav keys (24 keys already present)      │  │
│  │    reuse existing common.* for Save/Cancel/Delete/etc. (Decision 5)     │  │
│  │    add admin.<page>.* CRUD keys (15 pages × ~10-20 keys each)           │  │
│  │    add compare.*, verifyEmail.*, legal.privacy.*, legal.terms.*         │  │
│  │    add recipe.create.section/field/placeholder/button/error.*           │  │
│  │    add recipe.edit.section/field/placeholder/button/error.*             │  │
│  │    add error.boundary.* for ErrorBoundary chrome                        │  │
│  │    normalize divergent labels (Dose (grams) vs Dose (g))                │  │
│  │                                                                        │  │
│  │  i18n.test.ts → deterministic bidirectional parity                      │  │
│  │    replace sampled en→tr property test with                             │  │
│  │    expect(Object.keys(en).sort()).toEqual(Object.keys(tr).sort())       │  │
│  │                                                                        │  │
│  │  15 admin pages → import useTranslation, replace literals               │  │
│  │  5 user-facing pages → full conversion                                 │  │
│  │    Privacy/Terms: translate headers + notice, keep English body (D7)    │  │
│  │    NotFoundPage: no-op if D37 landed (already uses t())                 │  │
│  │    VerifyEmailPage: fix log-message drift while touching                │  │
│  │  2 partial recipe pages → complete conversion (~30 strings each)        │  │
│  │                                                                        │  │
│  │  Per-page tr-locale spot-check tests (new or extended)                  │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Why bundle vs split

The three items share no code paths but share a **string-touching contract**: D36 must land before
D40 so each string is extracted to its canonical component first (BanDialog, Section/Field) and then
translated once. D37 must land before D40's NotFoundPage conversion so D40 doesn't translate a page
that's about to be deleted. Bundling keeps the sequencing enforced in one PR; splitting risks D40
landing against the pre-D36/pre-D37 state and then D36/D37 invalidating the just-translated strings.

The scope is larger than Wave 1 or Wave 2 (~50 files, ~150+ new i18n keys), but each sub-change is
independently shippable within the PR: D36's tests pass before D37 starts; D37's tests pass before
D40 starts. The tasks.md enforces this via ordering constraints.

---

## Decision 1 — HomePage `RecipeCard` needs NO variant prop

**Finding:** The D36 plan hypothesised HomePage's local `RecipeCard` might be an "intentional
compact variant" needing a `variant` prop. The research shows it's a **strict subset** (fewer
fields), not a stylistically different variant. The only material difference is the missing
`currentVersion` badge row (brewMethod • drinkType • ★ rating), which the shared card guards with
`recipe.currentVersion &&`. There is no compact layout, no different link target, no missing
badges that were intentional.

**Decision:** Delete the local `RecipeCard` (lines 103–137) and import the shared one. No variant
prop. Adopting the shared card adds the `currentVersion` badge row to the home page — a
**behavioural improvement**, not a regression. The existing `HomePage.test.tsx` assertions (author
buttons, titles, counts) still pass because the shared card has the same `<button>` + `<Link>`
structure; mock data without `currentVersion` renders nothing extra via the guard.

**Rejected alternative:** Add a `variant='compact'` prop that suppresses the badge row. Rejected
because the "compact" framing is a post-hoc rationalisation of a stale fork — there's no product
intent behind the missing row, it's just drift.

---

## Decision 2 — Error page visual style: keep the composed version's emoji + `text-primary`

**Finding:** The two `NotFoundPage` implementations have different visual styles:
- `ErrorPage.tsx`'s `NotFoundPage` (i18n'd, dead): `text-4xl` + `var(--text-primary)` + 🫥 emoji
  illustration (8xl), delegates to base `ErrorPage`.
- `NotFoundPage.tsx` (zero `t()`, routed): `text-6xl` + `var(--accent-primary)`, no emoji, has
  `<SEOHead noIndex>`.

**Decision:** Keep the composed version's style (emoji + `text-primary` + `text-4xl`) as canonical.
Port `<SEOHead noIndex title='Page Not Found' />` from the routed version into the composed
`NotFoundPage` (and into the base `ErrorPage` so all variants get `noIndex`). The emoji illustration
is a nicer UX than bare "404"; the `accent-primary` colour is arbitrary. The `text-6xl` size is a
minor loss but the emoji compensates. **This is a product call** — if the team prefers the routed
version's style, swap it; the consolidation work is the same either way.

---

## Decision 3 — Delete `ForbiddenPage` (no clean trigger without changing `RequireAuth` UX)

**Finding:** `ForbiddenPage` exists in `ErrorPage.tsx` but is never rendered. `RequireAuth.tsx:22`
handles the non-admin case by returning `<Navigate to='/' />` (silent redirect), NOT by throwing a
403 route error. Loaders don't throw 403 either. To wire `ForbiddenPage`, you'd need to either:
- Change `RequireAuth` to `throw new Response(null, { status: 403 })` for the admin case — a
  **behaviour change** (currently silent redirect, would become a 403 page), OR
- Change `RequireAuth` to `return <ForbiddenPage />` — also a behaviour change.

Both are product decisions about the admin-guard UX, not code consolidation.

**Decision:** Delete `ForbiddenPage`. The current redirect-to-`/` UX is reasonable and changing it
is out of scope for a "consolidate dead code" plan. The `error.403` i18n key can remain in the
locale files (it's harmless) or be removed — **keep it** (removing keys risks breaking the parity
test for no benefit, and a future 403 page might use it). Document the deletion in the
`error-pages` spec with a scenario noting `ForbiddenPage` was deleted because `RequireAuth`
redirects rather than throwing.

**Rejected alternative:** Wire `ForbiddenPage` by changing `RequireAuth` to throw 403. Rejected
because it changes the admin-guard UX (silent redirect → 403 page) which is a product decision
requiring separate buy-in, not a structural cleanup.

---

## Decision 4 — `useBanUser` hook design: `onSuccess` callback + error surfacing on both call sites

**Finding:** The two admin pages have different refresh flows:
- `AdminUsersPage`: optimistic `setUsers((prev) => prev.map(...))` — list array update.
- `AdminUserDetailPage`: optimistic `setUser((prev) => prev ? {...prev, isBanned} : prev)` — single
  object update.

Neither page re-fetches from the server; both patch local state. The D36 plan's "list reload vs
detail reload" framing is slightly wrong — there is **no reload in either page**.

Additionally, `AdminUserDetailPage` **silently swallows** ban/unban errors (`catch {}` at lines 56
and 66, with no `setError` and no error-banner element in the JSX). `AdminUsersPage` surfaces them
via an `error` banner (lines 107–114). This is a pre-existing bug.

**Decision:** The `useBanUser` hook owns the `{ user, reason, processing, error }` state and calls
`adminApi.banUser`/`unbanUser`. It exposes:
- `openBanDialog(user)` — sets `user`, clears `reason`/`error`, sets `processing: false`.
- `confirmBan()` — sets `processing: true`, calls `adminApi.banUser(user.id, reason)`, on success
  calls `onSuccess(user.id, true)` and closes the dialog, on failure sets `error` + resets
  `processing`.
- `unban(userId)` — calls `adminApi.unbanUser(userId)`, on success calls `onSuccess(userId, false)`,
  on failure sets `error`.
- `clearError()` — clears the error state.

The `onSuccess(userId, isBanned)` callback is passed in by each page and applies the result to its
own state container. This preserves the two intentional refresh-flow differences.

**Error surfacing:** The hook exposes `error` on both call sites. `AdminUsersPage` already has an
error banner (render `error` in it). `AdminUserDetailPage` **must add an error-display element** —
the root cause of the silent-swallow bug is that the page has nowhere to show the error. Add a
minimal `<div>` near the ban/unban buttons that renders `error` when set. This is a bug fix folded
into the extraction, not scope creep — the extraction is the natural moment to surface the
previously-swallowed errors.

**Rejected alternative:** Preserve the silent-swallow in the detail page to avoid scope creep.
Rejected because the whole point of extracting `useBanUser` is to unify the behaviour; preserving a
bug during extraction defeats the dedup.

---

## Decision 5 — Reuse existing `common.*` vocabulary; do NOT duplicate into `admin.common.*`

**Finding:** The `common.*` namespace already has the shared vocabulary the D40 plan wanted to
extract into `admin.common.*`: `common.save`, `common.cancel`, `common.delete`, `common.edit`,
`common.search`, `common.loading`, `common.noResults`, `common.previous`, `common.next`,
`common.yes`, `common.no`, `common.confirm`, `common.back` (`en.json:251-278`, mirrored in tr).
The D40 plan said "Extract shared admin vocabulary into `admin.common.*` to avoid 15 copies" — but
the vocabulary already exists in `common.*` and is used by non-admin pages. Duplicating into
`admin.common.*` would create a parallel set of keys for the same strings.

**Decision:** Reuse `common.*` directly in admin pages. Do NOT create `admin.common.*`. Add only
the admin-specific keys that don't already exist (e.g. `admin.users.banned`, `admin.users.active`,
`admin.recipes.visibility.draft`, etc.) under `admin.<page>.*` namespaces.

**Rejected alternative:** Create `admin.common.*` as a parallel vocabulary. Rejected because it
duplicates existing keys and forces the parity test to track two copies of "Save"/"Cancel"/etc.

---

## Decision 6 — Locale key convention: flat keys (existing), NOT nested namespaces

**Finding:** The locale files (`packages/shared/src/i18n/en.json`, `tr.json`) are **flat-string
JSON** — 504 keys, all top-level values are strings, keyed by dotted paths like `"error.404"`,
`"recipe.list.title"`, `"admin.dashboard"`. There are no nested JSON objects. The web app's `t()`
function (`packages/shared/src/i18n/index.ts:10`) takes a single dotted key string and looks it up
in the flat object. The D40 plan proposed "establish key namespaces like `admin.users.*`,
`admin.dashboard.*`" — but the existing convention IS dotted flat keys, not nested objects.

**Decision:** Follow the existing flat-key convention. New keys are flat dotted strings:
`admin.users.title`, `admin.users.searchPlaceholder`, `admin.users.roleAdmin`, etc. Do NOT
introduce nested JSON objects in the locale files. The D40 plan's "namespace" language refers to
the dotted-key prefix, not a JSON object structure.

**Impact on D37:** The D40 plan proposed a `notFound.*` namespace, but `error.404` already exists
and `ErrorPage.tsx` already uses it. D37 should keep using `error.404` (and `error.500`,
`error.403`), NOT introduce a parallel `notFound.*` namespace. The `error-pages` spec codifies this.

---

## Decision 7 — Legal pages: translate headers + notice, keep English legal body

**Finding:** `PrivacyPage.tsx` (61 lines) and `TermsPage.tsx` (62 lines) are **legal prose**: each
has 6 numbered sections (`<h2>`) followed by 1-3 sentence English paragraphs in `<p>` tags. The
section titles are short UI strings (trivially translatable), but the body paragraphs are formal
legal English. Translating legal prose requires a lawyer or qualified translator; machine-drafting
legal Turkish is risky (incorrect legal terms could create liability).

**Decision:** Translate the page title (`legal.privacy.title`, `legal.terms.title`), the "Last
updated" label (`legal.lastUpdated`), and the 6 section headers (`legal.privacy.section1`...
`section6`, same for terms). Keep the legal body paragraphs in English. Add a translated notice at
the top of the page body: `legal.notice` = "This document is currently available in English only.
/ Bu belge şu anda yalnızca İngilizce olarak mevcuttur." This makes the pages partially localized
(headers + notice in Turkish) without risking inaccurate legal translations. Document the decision
in the `i18n` spec and in the implementing change's tasks.

**Rejected alternative:** Translate the legal body fully. Rejected because machine-drafted legal
Turkish is a liability risk and human translation is out of scope for a debt cleanup. The
partial-translation approach is reversible — if a qualified translator is later engaged, the body
can be translated and the notice removed.

---

## Decision 8 — Do NOT fix pre-existing empty `catch` blocks in admin pages (out of scope)

**Finding:** Several admin pages have empty `catch` blocks that violate the `web-page-logging`
async-failure requirement: `AdminAuditLogPage.tsx:38`,
`AdminCoffeeVarietiesPage.tsx:205,220`, `AdminCompatibilityPage.tsx:31,41,49`,
`AdminRecipesPage.tsx:44,53`, `AdminVendorsPage.tsx:33,58,68`. These are pre-existing logging-spec
violations. D40's conversion touches these files to add `t()` calls but does NOT restructure the
catch blocks.

**Decision:** D40 converts user-visible strings to `t()` but does NOT add `log.error` to empty
catches or restructure catch blocks. This is out of scope — fixing empty catches is a logging-debt
item, not an i18n item. The `i18n` spec notes that converted pages may still have pre-existing
logging violations tracked separately. **Exception:** `VerifyEmailPage.tsx:41` has a log-message
drift (`'token verification failed'` vs the `web-page-logging` spec's `'verifyEmail failed'`) — D40
fixes this while touching the file because it's a one-line fix in a file already being converted.

**Rejected alternative:** Fix all empty catches during D40. Rejected because it expands scope from
i18n to logging debt, mixing two concerns in one change. The empty catches are tracked by the
`web-page-logging` spec and can be addressed in a dedicated pass.

---

## Decision 9 — Un-export the base `ErrorPage` to satisfy "no dead exports"

**Finding:** The D37 acceptance criterion says "Every export of that module is reachable from the
router or error boundary (no dead exports)." The base `ErrorPage` (the generic
`{ statusCode, message, illustration }` component) is used internally by `NotFoundPage` and
`ServerErrorPage` (they compose it), but it's also exported and imported only by
`ErrorPage.test.tsx`. If `ForbiddenPage` is deleted (Decision 3), the base `ErrorPage` is the only
export not directly rendered by the router/boundary — it's reachable transitively via the variants
but not directly.

**Decision:** Un-export the base `ErrorPage` (make it a non-exported internal helper). The three
specific variants (`NotFoundPage`, `ServerErrorPage`, and... wait, `ForbiddenPage` is deleted) —
the two specific variants (`NotFoundPage`, `ServerErrorPage`) are the only exports, and both are
reachable from the router (NotFoundPage via the `*` catch-all) or boundary (ServerErrorPage via the
5xx branch). Update `ErrorPage.test.tsx` to import the base via a named internal export for testing
OR test the base indirectly through the variants (preferred — test the variants, which exercise the
base). If direct base testing is needed, keep a `TestErrorPage` export gated by `import.meta.env
=== 'test'` — but this is over-engineering; test the variants.

**Rejected alternative:** Keep the base exported and accept it as "transitively reachable." Rejected
because the D37 criterion is explicit about "no dead exports" and the base is only used by the
variants + test.

---

## Decision 10 — Strengthen the locale-parity test to deterministic bidirectional

**Finding:** The existing `packages/shared/src/i18n/i18n.test.ts` (22 lines) uses property-based
testing (`npm:fast-check`) with `numRuns: 100` sampling 100 random keys of 504 from en→tr only. It
does NOT assert tr→en direction, and with 504 keys it could miss an asymmetry on a given run (100
samples < 504 keys). The current state is exact parity (504=504, verified), but the test doesn't
guarantee it deterministically.

**Decision:** Replace the sampled property test with a deterministic bidirectional equality check:

```typescript
describe('i18n key parity', () => {
  it('en and tr expose identical key sets', () => {
    const enKeys = Object.keys(enJson).sort();
    const trKeys = Object.keys(trJson).sort();
    expect(enKeys).toEqual(trKeys);
  });

  it('every locale value is a string', () => {
    for (const [key, value] of Object.entries(enJson)) {
      expect(typeof value).toBe('string', `en.json key ${key} is not a string`);
    }
    for (const [key, value] of Object.entries(trJson)) {
      expect(typeof value).toBe('string', `tr.json key ${key} is not a string`);
    }
  });
});
```

Keep the property-based test as a secondary check if desired, but the deterministic test is the
primary gate. This ensures any new key added to en without tr (or vice versa) fails the test
immediately.

**Rejected alternative:** Keep the sampled test and add a higher `numRuns`. Rejected because
sampling can miss keys; deterministic equality is the only way to guarantee parity.

---

## Decision 11 — Spec structure: ADD three new capabilities, REFERENCE existing specs

**Finding (from spec-research subagent):** No existing spec covers i18n, error pages, or general
shared web components. The closest are:
- `recipe-list` — scoped to the recipe-listing module (D11 precedent); D36's HomePage RecipeCard
  adoption is a new consumer, not a spec modification.
- `error-handling` — scoped to in-page fetch-failure error states; D37's route-level error pages
  are a distinct concern (the `optimistic-rollback` precedent shows splitting concerns is the
  established pattern).
- `web-page-logging` — covers ErrorBoundary logging but not its UI/UX contract; D37/D40 reference
  it but don't modify it.
- `web-context-hook-logging` — covers I18nContext logging; D40 references it but doesn't modify it.

**Decision:** ADD three new capabilities:
1. `web-shared-components` — D36's three dedup clusters. References `recipe-list` (the established
   shared-card pattern) and `model-test-coverage` (Vitest conventions).
2. `error-pages` — D37's consolidation. References `error-handling` (i18n key pattern) and
   `web-page-logging` (ErrorBoundary logging).
3. `i18n` — D40's completion. References `web-page-logging`, `web-context-hook-logging`,
   `static-cache`.

No existing spec is MODIFIED. This matches the repo's established pattern: `recipe-list` (D11),
`optimistic-rollback` (D18), `error-handling` (fix-error-swallowing) were all specced as new
capabilities.

**Rejected alternative:** MODIFY `error-handling` to absorb error pages, and MODIFY `recipe-list`
to assert RecipeCard is the single source app-wide. Rejected because it bloats two focused specs
with adjacent concerns; the split pattern is cleaner and matches precedent.

---

## Drift from the original plans (2026-07-04 → 2026-07-06)

The research surfaced several drifts from the D36/D37/D40 plans as written. This design resolves
them:

| Plan claim | Actual state (2026-07-06) | Resolution |
|---|---|---|
| D36: "RecipeEditPage no longer has Section/Field copies" | RecipeEditPage HAS `EditSection` (`:462`) / `EditField` (`:471`), byte-for-byte identical bodies | D36 extracts to `components/form/` and BOTH pages import shared; rename EditSection→Section at 27 call sites |
| D36: HomePage `RecipeCard` at `:94` | At lines 103–137 (file grew 9 lines) | Use correct line range in tasks |
| D36: AdminRecipesPage `:87` "inline recipe-card markup" | Line 87 is a `<tbody>` map; the admin list is a `<table>`, not cards | Do NOT extract (table ≠ card); document in spec |
| D37: "Nothing imports from ErrorPage.tsx" | `ErrorPage.test.tsx` imports all 4 exports | Update test file as part of D37 |
| D37: "i18n keys" listed as something the routed NotFoundPage HAS | Backwards — the routed version has ZERO `t()`; ErrorPage.tsx's variant has the i18n | Merge direction: ErrorPage.tsx is canonical (already i18n'd); delete routed version |
| D37: "ForbiddenPage for 403 loader/route errors" | `RequireAuth` redirects, doesn't throw 403; no loader throws 403 | Delete ForbiddenPage (Decision 3) |
| D37 plan misses the 3rd copy of 404 prose in ErrorBoundary | `ErrorBoundary.tsx:34-36` duplicates NotFoundPage.tsx's prose verbatim | D37 delegates boundary 404 to `<NotFoundPage />` |
| D40: "Establish `admin.*` namespace" | `admin.*` (24 keys) already exists but is unused | Wire existing keys; add only missing per-page CRUD keys |
| D40: "Extract shared admin vocabulary into `admin.common.*`" | `common.*` already has Save/Cancel/Delete/etc. | Reuse `common.*` (Decision 5) |
| D40: "Establish `notFound.*` namespace" | `error.404` already exists and is used by ErrorPage.tsx | Use `error.404` (Decision 6); no `notFound.*` namespace |
| D40: parity test "if not already present" | Parity test EXISTS but is one-directional + sampled | Strengthen to deterministic bidirectional (Decision 10) |

---

## Risks and unknowns

1. **D40 scope is large (~150+ new i18n keys, 22 pages).** The risk is key naming drift and missed
   strings. Mitigation: the per-page grep gate (`grep -rn "[A-Z][a-z]" apps/web/src/pages/admin/...`
   for capitalised literals outside `t()`) and the tr-locale spot-check tests. The tasks.md
   includes both as acceptance gates.

2. **D37 changes the 404 visual style** (emoji + `text-primary` + `text-4xl` replaces `text-6xl` +
   `accent-primary`). This is a product call — if the team prefers the routed version's style, swap
   it (Decision 2). The consolidation work is the same either way.

3. **D37 removes the "Reload Page" button from 5xx** (ServerErrorPage doesn't have one; the boundary
   currently does). Accepted — the user can refresh manually. If this is a regression concern, add a
   `reload` prop to `ServerErrorPage` or keep the boundary's reload button as a wrapper.

4. **D36's BanDialog extraction surfaces previously-swallowed errors on the detail page.** This is
   a bug fix (Decision 4) but changes the detail page's UX (new error banner). If the team prefers
   to preserve the silent-swallow, the hook can swallow errors on the detail call site only — but
   this defeats the unification.

5. **D40's legal-pages decision (keep English body) is reversible but visible.** Turkish-locale
   users will see a notice that the legal docs are English-only. This is honest and standard
   practice; if a qualified translator is later engaged, the body can be translated and the notice
   removed.

6. **Pre-existing empty `catch` blocks in admin pages are NOT fixed by D40** (Decision 8). A
   reviewer might flag them. They're tracked by `web-page-logging` and are out of scope for an i18n
   change.

7. **`VerifyEmailPage.tsx` log-message drift** (`'token verification failed'` vs spec's
   `'verifyEmail failed'`) is fixed during D40 conversion (the one-line exception to Decision 8)
   because the file is already being touched.

---

## Testing strategy

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  WAVE 3 TEST STRATEGY                                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  D36 tests (new)                                                             │
│  ├── BanDialog.test.tsx        component: renders, callbacks, processing     │
│  ├── useBanUser.test.ts        hook: state transitions, error surfacing      │
│  └── HomePage.test.tsx (exist) regression: shared RecipeCard renders OK      │
│                                                                              │
│  D37 tests (new + updated)                                                   │
│  ├── ErrorPage.test.tsx (upd)  remove ForbiddenPage; add SEOHead assertions  │
│  └── ErrorBoundary.test.tsx    NEW: throw 404/500 from test loaders          │
│                                                                              │
│  D40 tests (new + strengthened)                                              │
│  ├── i18n.test.ts (strength)   deterministic bidirectional key parity        │
│  └── per-page tr-locale tests  spot-check: render under tr, assert TR string │
│                                                                              │
│  Verification gates                                                           │
│  ├── make check                type-check all workspaces                     │
│  ├── make lint                 lint all apps and packages                    │
│  ├── make fmt                  deno fmt (lineWidth 100, singleQuote, etc.)   │
│  ├── make test                 all tests via Docker with --allow-all         │
│  └── grep gate per page        no user-visible literals outside t() calls    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

The tr-locale spot-check pattern is mature in the codebase (~30 existing tests mock `useTranslation`
with a `trT` function). Each converted page gets at least one test that renders under tr and asserts
a known Turkish string appears. This is a spot-check, not exhaustive — the grep gate catches
missed literals.

The deterministic parity test (`expect(Object.keys(en).sort()).toEqual(Object.keys(tr).sort())`)
guarantees no key ships half-translated. Combined with the per-page spot-checks, this gives high
confidence that the i18n conversion is complete.