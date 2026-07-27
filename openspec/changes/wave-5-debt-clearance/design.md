## Context

Wave 5 clears everything the 2026-07-19 re-audit confirmed open: all seven D99 ledger items plus the
new untracked P1s (broken `test:db`, mock-mirror tests, coverage shortfall vs the 85% target,
frontend DRY/consistency drift, disabled lint rules). Unlike Wave 4's four independent fillers, Wave
5 has real sequencing constraints — the Toast primitive (T3) must exist before the empty-catch UX
fixes (T6), the lint-config flip must come after all violation fixes, and the coverage gate (T8) can
only be set after T1–T7 have landed their tests. The evidence base is preserved in `./audit/`; the
D99 verdicts JSON's conclusions are folded into `proposal.md` and this design.

### Architecture — eleven tracks, four sequencing constraints

```text
┌────────────────────────────────────────────────────────────────────────────┐
│  WAVE 5 — eleven tracks, ordered by dependency (not strictly serial)       │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  T1 Correctness & CI health ──── FIRST (un-breaks test/ci entry points)    │
│    fix test:db TS2352 · D99.9 comment authz · 4 mock-mirror rewrites       │
│                                                                            │
│  T2 Collections completion      T5 i18n completion     T7 Backend hygiene  │
│    D99.1 cache · D99.5 US-9       D99.7 + new sweep      5 stray sites     │
│    D99.6 tests · D99.3 seed       (absorbs T3/T4 keys)                     │
│                                                                            │
│  T3 Frontend DRY (primitives) ──► T4 Visual consistency                    │
│    Toast/ConfirmDialog ───────────────┐                                    │
│    RecipeCard/EmptyState/…            ▼                                    │
│                                 T6 Type-safety & lint                      │
│                                   empty-catch fixes need Toast (T3)        │
│                                   deno.json rules.exclude flip = LAST step │
│                                                                            │
│  T8 Coverage ≥85% + gates ────── after T1–T7 land their tests              │
│    local DB provisioning · admin/recipe/auth backfill · gate script        │
│                                                                            │
│  T9 Docblocks   T10 Dependencies (gated TS7 section LAST)   T11 Docs       │
│    (anytime)      safe batch → Deno 2.9.3/CI sync → TS7 gate  (anytime)    │
│                                                                            │
│  DEFERRED (ledger-only): D99.8 sargability · recipe/contact architecture   │
│    deviations · test-file naming · generic page components (rejected)      │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Decision 1 — TypeScript 7 (tsgo): in-wave, gated, with an explicit defer fallback

**Finding:** `typescript` 6.0.3→7.0.2 is the only MAJOR in the outdated set. TS7 is the Go-native
`tsgo` compiler with platform-native binaries; type-checking is documented at parity with 6.0, but
two BrewForm-specific unknowns remain: (a) apps/web invokes the compiler as
`deno run -A npm:typescript/tsc --noEmit -p tsconfig.json` — the npm-binary resolution path under
Deno node-compat is exactly where a native-binary package can break; (b) `deno check` on
api/db/shared uses Deno 2.9's **bundled** TS 6.0.3, so bumping the web dep introduces compiler skew
inside one repo.

**Decision:** Keep TS7 in wave 5 but as a **gated final section of T10**, after the safe batch and
the Deno/CI version sync. Gate protocol: (1) on the branch, verify `deno run -A npm:typescript/tsc`
resolves and runs under TS7, exercising the exact flags the check task uses (`--noEmit`, `-p`,
`ignoreDeprecations`); (2) run it against apps/web and **diff the diagnostic list vs 6.0.3** —
parity means same errors (zero today) and no new false positives; (3) document the resulting
compiler skew (web checks on 7.0.2/tsgo, deno check on bundled 6.0.3) in the dependency notes. Bump
only if all three pass. **Fallback is a first-class task, not an implicit escape hatch:** if any
gate step fails, pin 6.0.3, record a new ledger item with the failure evidence, and land the rest of
T10 unchanged.

**Rejected alternative:** Defer TS7 outright to a future wave. Rejected because the verification
cost is one branch-hour and the failure mode is fully contained (a dev-dependency used by one check
task); deferring without trying converts a cheap experiment into permanent drift.

**Rejected alternative:** Bump unconditionally and fix fallout. Rejected — a native-binary compiler
under Deno node-compat is precisely the case where "fix fallout" can balloon; the gate makes the
go/no-go objective.

---

## Decision 2 — House-built, dependency-free Toast + ConfirmDialog

**Finding:** The web app has **zero toast infrastructure** — mutation feedback today ranges from
silent navigation to full-page checkmark screens. Delete confirmation splits three ways: 9
`globalThis.confirm` sites (some concatenating `t(key) + '?'`), and 3 hand-rolled bespoke modal
shells. T6's empty-catch fixes need a way to surface failure to the user, which today does not
exist.

**Decision:** Build two minimal shared primitives, no new dependencies:

- **Toast** — `ToastProvider` (React context + reducer holding a small toast queue) rendered once in
  `Layout.tsx`; `useToast()` returns `toast.success(i18nKey)` / `toast.error(i18nKey)` (keys, not
  strings — i18n by construction). Auto-dismiss with a timeout, `role="status"` /
  `aria-live="polite"`, themed via the existing CSS variables so all three themes work.
- **ConfirmDialog** — a `useConfirm()` hook returning a promise:
  `if (await confirm({ titleKey, bodyKey, danger: true })) { … }`. One dialog component mounted by
  the provider (alongside toasts in `Layout.tsx`), styled with `.card`/`.btn-danger`, focus-trap +
  Escape handling.

Migrate the 9 `globalThis.confirm` sites and 3 bespoke modal shells to `useConfirm()`; use
`toast.error` in the T6 empty-catch fixes and `toast.success` for currently-silent mutations.

**Rejected alternative:** Adopt a library (sonner, react-hot-toast, @base-ui dialog composition).
Rejected because the need is ~150 lines total, the repo already carries a themed style system the
library would fight, and every new dependency is future audit surface. `@base-ui/react` is already a
dependency but its dialog is a styling substrate, not a confirm-flow — the promise-hook ergonomics
are the actual point.

**Rejected alternative:** Keep `globalThis.confirm` (it works everywhere). Rejected — it is
unthemeable, unstylable, blocks the main thread, and is the source of the `t(key)+'?'` concatenation
anti-pattern.

---

## Decision 3 — Re-enable all three lint rules; fix-first, flip-config-LAST

**Finding:** `deno.json` `rules.exclude` disables `no-explicit-any`, `require-await`, and `no-empty`
repo-wide. Measured re-enable cost: `no-explicit-any` 7 prod + 119 test diagnostics; `require-await`
44 prod; `no-empty` 14 prod — every one a silent `catch {}` on a user mutation, the exact failure
class D17 existed to kill. ~40 test files additionally carry file-level directives that mask nothing
today (the rules are off) — the same vestigial pattern D35 deleted from production.

**Decision:** Re-enable **all three rules** in one track (T6), ordered so lint is green at every
commit:

1. Fix all prod violations: 14 empty-catches (toast feedback where user-facing, justified comment
   where genuinely fire-and-forget), 44 `require-await` (drop `async` or await the thing), 7 prod
   `any` (incl. `taste/service.ts`'s 3 and the RecipeCompare/FocusMode cluster).
2. Test-file `any` policy: **typed fix where trivial** (most of the 119 are mock objects that can
   use `Partial<T>` / `vi.mocked`), otherwise a **line-level ignore WITH a justification comment** —
   never file-level. Delete the ~40 no-op file-level directives.
3. **Flip `deno.json` last** — remove the three rules from `rules.exclude` as the final T6 commit,
   proving zero remaining violations.

**Rejected alternative:** Re-enable only `no-empty` (the highest-value rule) and defer the other
two. Rejected because the sweep already measured the full cost (~184 diagnostics, most mechanical)
and a partial flip leaves the vestigial-directive problem in place — the marginal cost of all three
together is small, the audit cost of re-measuring later is not.

**Rejected alternative:** Flip config first and fix under a red lint. Rejected — it breaks `make ci`
for the whole track duration and invites suppression-by-directive instead of fixes.

---

## Decision 4 — Page dedup is primitives-first; generic page components rejected

**Finding:** The duplication inventory (`audit/frontend-duplication.md`) shows two shapes of
repetition: (a) identical _blocks_ (recipe cards ×3 pages, pagination ×4-5, empty/loading states
×19/18, filter fields, visibility emoji ×3), and (b) similar _page skeletons_
(CoffeeVarieties/EquipmentCatalog near-clone catalogs; BeanList/EquipmentList/SetupList CRUD
triplets).

**Decision:** Extract **shared blocks that pages compose** — extend `RecipeCard` (optional
`hideAuthor`/`forkCount`/version-strip props), adopt `CollectionCard`/`PaginationControls`, add
`EmptyState`/`LoadingState`/`ErrorState`/`Toast`/`ConfirmDialog`, consolidate `Field`/
`FilterField`, extract the catalog header/filter/grid blocks — and keep every page as its own
explicit composition of those blocks. Do **NOT** build `CrudListPage`/`CatalogPage` generic
components.

**Rejected alternative:** Generic `CrudListPage<T>`/`CatalogPage<T>` driven by config objects.
Rejected as a leaky abstraction: the three CRUD pages already diverge (bean filters, equipment
catalog links, setup composition) and a config-driven page either grows prop-flags for every
divergence (worse than duplication) or forces pages back out of it at the first real feature. Blocks
are the stable unit; page composition is the variance point. This decision is recorded in the
DEFERRED list so a future wave doesn't relitigate it by accident.

---

## Decision 5 — Collection cache: singleton import, key/TTL/invalidation matrix, visibility re-check

**Finding:** The collection module has zero cache involvement; `getCollection` re-runs a 4-level
multi-join (`collection/model.ts:9-33`) per GET. The codebase's dominant pattern is the **singleton
import** (`equipment/service.ts` get :32 / set :42 / delete :108/:127; also coffee-variety, sitemap,
recipe, admin). Taste's "DI parameter" is itself fed from the singleton at `taste/index.ts:21` —
`c.get('cache')` is read nowhere despite `main.ts:72` still setting it. The mutation surface is
**six** functions (create :97, update :114, delete :136, addRecipe :255, removeRecipe :297, reorder
:319). `listMyCollections` takes an optional `recipeId` param (it feeds the AddToCollection modal's
"already in collection" marks). `toDetailOutput` keeps `userId`/`visibility` in the cached shape,
and the visibility check lives at `service.ts:157-162`.

**Decision:** Wire the **singleton import** (`cacheProvider` from `utils/cache`) directly in
`collection/service.ts` — no router signature changes, no `c.get('cache')` plumbing. Matrix:

| Concern              | Choice                                                                                                                                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Detail key           | `['collection-detail', id]`, TTL **10m**                                                                                                                                                                         |
| Cached-hit safety    | replay the `service.ts:157-162` visibility check against the cached object (it retains `userId`/`visibility`) — a cache hit must never widen access                                                              |
| List prefix          | `['cache', 'collections', ...]`, TTL **5m**                                                                                                                                                                      |
| `recipeId` handling  | when `listMyCollections` is called with `recipeId`, **bypass the cache** (read-through, no store) — the per-recipe membership overlay would otherwise need a key per (user, recipe) pair with near-zero hit rate |
| `createCollection`   | invalidates **list prefix only** (fresh UUID — no detail entry can exist)                                                                                                                                        |
| Other five mutations | invalidate detail key `['collection-detail', id]` **and** `deleteByPrefix(['cache','collections'])`                                                                                                              |

**Rejected alternative:** CacheProvider DI parameter (taste's signature style). Rejected — taste
itself is singleton-fed in practice, `c.get('cache')` is dead plumbing, and the DI signature spreads
a 7-argument thread through routes for a testability the singleton already provides (tests swap via
the provider's test hooks, as coffee-variety's `setCacheProvider` demonstrates).

**Rejected alternative:** recipeId-aware cache keys (`['cache','collections',userId,recipeId]`).
Rejected for hit-rate: the modal is opened per-recipe, per-user, rarely twice within 5 minutes —
caching it buys nothing and doubles the invalidation surface.

---

## Decision 6 — D99.9: 404 (not 403), gate the list route too, mentions stay behind creation

**Finding:** `createComment` never checks recipe visibility or existence for top-level comments;
`listComments` and its auth-less route are equally open — anyone can read or write comments on a
draft/private recipe by UUID, and the F04 mention side-effect then leaks `title`/`slug` in-app and
by email. The codebase convention is split: GET surfaces existence-hide with 404
(`recipe/index.ts:251/283/318`, `share.ts:76`); some mutation surfaces use 403 (fork, qrcode,
collection item ops).

**Decision:**

- Add a recipe-visibility check to **both** `createComment` and `listComments` (parity — gating only
  create still leaks content via list, and gating only list still allows write + mention email).
- Return **404 `Recipe not found`** on an invisible recipe, not 403 — comments are an extension of
  the recipe GET surface, and 403 on a "nonexistent" recipe confirms existence, which is exactly
  what the draft/private semantics hide. Nonexistent-recipe UUIDs get the same clean 404 instead of
  today's FK error.
- **Mention side-effects need no separate gate:** they already run only inside successful creation
  (`comment/service.ts:100-105`), so gating creation closes the disclosure vector — do not add a
  second visibility check inside the notification path.

**Rejected alternative:** 403 FORBIDDEN (matches fork/collection mutations). Rejected because those
surfaces operate on IDs the caller legitimately knows; the comment surface takes an arbitrary UUID,
and the 404 convention on recipe GETs exists precisely to avoid the existence-confirmation oracle.

**Out of scope, ledgered:** the audit found the same gate missing on `toggleLike`,
`toggleFavourite`, `POST /:id/rate` (no existence check at all), and `saveNotes` (no ownership
check). These are recorded in the ledger as follow-ups — bundling them here would make T1's
behavioural diff too wide to review as one unit.

---

## Decision 7 — Coverage gate mechanics: parse-script for deno, thresholds for vitest, ratchet for web

**Finding:** `deno coverage` has no built-in threshold flag — CI currently only uploads the report
artifact. Vitest 4 has native `coverage.thresholds` but by default counts **only loaded files**: 14
web prod files (1,093 lines, incl. `router.tsx` and all 3 collection pages) are invisible, inflating
75.31% to what is honestly ~64–68%. The deno scope measures 72.21% lines; the path to ≥85% is
measured and concrete (admin real tests +~1,200 → ~80.4%, recipe backfill +~550 → ~84.2%, auth incl.
new `auth/model.test.ts` +~250 → ~85.9%).

**Decision:**

- **Deno scope:** add `scripts/coverage-gate.ts` — a small Deno script that runs after
  `deno task test-coverage`, parses the lcov/summary output, and exits non-zero below the threshold.
  Gate at **85% lines** on the deno scope. Wire into `make ci` and the CI workflow.
- **Web scope:** set `coverage.include` (or `all`-equivalent) in `vitest.config.ts` so untested
  files count, then set `coverage.thresholds.lines` at the **honest measured baseline** (the number
  observed after the include fix and T2's collection-page tests land — expected high-60s to
  low-70s), rounded _down_ to the nearest whole percent. **Ratchet mechanism:** whenever a PR raises
  measured coverage by ≥1pt, the same PR bumps the threshold to the new floor — the threshold only
  moves up, and the rule is recorded in the spec, not left to memory.
- **Test-DB provisioning:** a make target that mirrors `.github/workflows/pr.yml:63-113` (create
  `brewform_test` in the compose Postgres, run migrations + seed) so the 129 DB-dependent API tests
  run locally without hand-provisioning; fix the cross-suite pollution that makes `seed-idempotency`
  fail after the API suite (isolate or re-seed between suites).

**Rejected alternative:** Gate web at 85% immediately. Rejected — the honest baseline is ~15 points
below that; an aspirational threshold either blocks all web PRs or gets disabled within a week. The
ratchet gets there monotonically without ever being red on day one.

**Rejected alternative:** A coverage-diff gate (per-PR delta) instead of an absolute threshold.
Rejected as heavier machinery (needs a baseline store) for a repo this size; the absolute gate +
ratchet is two lines of config and one small script.

---

## Decision 8 — Mock-mirror rewrite: real imports, established DB-test patterns

**Finding:** Four test files (`admin/service.test.ts`, `admin/index.test.ts`,
`equipment/service.test.ts`, `photo/service.test.ts`) re-implement the module under test inline and
assert against the copy — they pass regardless of what the production module does. The admin module
alone has 1,349 uncovered production lines behind green tests. The repo already has two proven
patterns for the real thing: `equipment/model.test.ts` (test-setup first import, inline
`crypto.randomUUID()` fixtures, `afterEach` hard-delete,
`{ sanitizeOps: false,
sanitizeResources: false }`) and `bodyLimit.test.ts` (stub Hono app +
`app.request()`).

**Decision:** **Rewrite, not patch** — delete the mirrored implementations wholesale and write tests
that import the production `service.ts`/`index.ts`. Service tests hit the scratch test DB via the
model (equipment/model.test.ts pattern); route tests mount the real router on a stub Hono app with
auth stubbed at the middleware seam (bodyLimit.test.ts pattern). Keep the old files' _scenario
lists_ as a checklist so no behavioural intent is lost, but no mirrored code survives. Expect to
find real admin-module bugs — fix them in separate commits within T1 so the test rewrite diff stays
reviewable.

**Rejected alternative:** Keep the mirrors and add integration tests beside them. Rejected — mirrors
are worse than no tests (they manufacture false confidence and still cost maintenance); coverage
numbers would also keep counting the wrong thing.

---

## Decision 9 — Docblock contract: the captured house style, applied to const/type exports

**Finding:** 890/1059 exported symbols (84%) are documented; the 196 missing are almost entirely
const/type exports — `packages/db/src/schema.ts` (43: all pgEnums + pgTables), shared `z.infer`
aliases (49) + constants (21), 22 Hono router consts, ~14 log/deps singletons — plus exactly one
true function: `seed.ts:927 main()`. The house style is already consistent and captured in
`audit/docblock-inventory.md`: API services use aligned `@param x - desc` + `@returns`; utils use
single-line verb-first `/** */` summaries; hooks/components use tag-less prose; schemas use
"Validates X; response envelope for METHOD /route" one-liners; `{@link}` for cross-refs.

**Decision:** Apply the captured style as the contract — do not invent a new one. For the bulk
categories: pgTable docblocks are one-liners naming the entity + notable columns/constraints
(soft-delete, unique targets); pgEnum docblocks name the driving `*_VALUES` constant; `z.infer`
aliases get "Inferred type of {@link XSchema}"-style one-liners; router consts get "Hono router for
/api/v1/x — see index.ts mounting" one-liners. The `code-documentation` spec codifies "every
exported symbol SHALL have a docblock" as the blanket rule for new code, enforced by review (no lint
plugin exists for Deno that matches the house style — do not add one).

**Rejected alternative:** Document only functions/components and exempt consts/types. Rejected — the
audit shows functions are already at ~99.9%; the entire remaining debt IS the const/type category,
and schema.ts/table docs are the highest-value ones for newcomers.

---

## Decision 10 — Sequencing and landing: ordered tracks, multiple PRs

**Finding:** Four hard edges exist: T3's Toast must precede T6's empty-catch fixes; T6's config flip
must follow every violation fix (T1–T7 all touch lintable code); T8's gate can only be set
truthfully after T1–T7's tests land; T10's TS7 gate should run last so its diagnostic diff runs
against the final code. Everything else is parallelizable.

**Decision:** Track order for execution: **T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10 → T11**,
with the explicit constraint set: {T3 < T6}, {T1..T7 < T6-flip}, {T1..T7 < T8-gate}, {T10-TS7 last
within T10}. T5/T7/T9/T11 float freely and can absorb idle time. **Land as multiple PRs**
(suggested: T1 | T2 | T3+T4 | T5 | T6 | T7+T9+T11 | T8 | T10) — a single wave-5 PR would be a
multi-thousand-line review no one can hold; per-track PRs keep each diff one-topic. The OpenSpec
change stays open until the last track lands, then archives once (`tasks.md` checkboxes track
cross-PR progress).

**Rejected alternative:** One mega-PR like Wave 4. Rejected — Wave 4 was four small independent
items; Wave 5 touches ~25 pages, rewrites 4 test files, and flips lint config. Review quality
collapses past ~2k lines.

---

## Risks and unknowns

1. **Admin test rewrite may surface real bugs (T1).** 1,349 lines get their first real coverage;
   budget for mid-track fix commits and keep them separate from the test diffs.
2. **TS7/tsgo under Deno node-compat is unproven here (T10).** Fully absorbed by Decision 1's gate +
   defer fallback; the wave succeeds either way.
3. **Cache-hit authz (T2).** The detail-key visibility re-check is the load-bearing security line —
   a cached private collection served without the re-check is an access widening. The T2 tests must
   cover the cached-hit-as-other-user case explicitly.
4. **US-9 model WHERE change (T2).** `getCollectionsForRecipe` hard-codes `visibility='public'`
   (`model.ts:304`); widening to "public + viewer's own" changes tested SQL — the existing
   `model_test.ts:626-676` assertions must be extended, not deleted.
5. **Lint flip races parallel work (T6).** Any PR merged between the fix commits and the flip can
   introduce new violations; do the flip in the same PR as the final fixes and rebase-check before
   merge.
6. **Coverage arithmetic is an estimate (T8).** The +1,200/+550/+250 line projections assume the
   rewritten tests execute the lines the mirrors dodged; if admin lands short, recipe/auth backfill
   absorbs the slack — the gate is set from the measured number, never aspirationally.
7. **i18n key churn (T5) vs parallel UI tracks (T3/T4).** New/renamed keys land in en+tr pairs
   (PBT-enforced); T3/T4 PRs that add UI strings must add their keys in the same PR to keep the
   parity test green at every merge point.
