# D42 — Typed Web API Boundary (Replace `Record<string, unknown>`)

**Severity:** Medium
**Status:** Open (2026-07-04)
**Relationship:** Gives `TECHNICAL_DEBT.md` §4.6 its dedicated plan. **Newly unblocked by D25**: `packages/shared/src/schemas/responses/` now contains response Zod schemas for every domain (badge, bean, coffee-variety, comment, equipment, follow, photo, preference, recipe, report, setup, taste, user, vendor) — the types §4.6 wanted can now be *derived*, not hand-written.

---

## Problem

`apps/web/src/api/index.ts` types most API responses (and several request payloads) as `Record<string, unknown>` — 25+ occurrences (verified 2026-07-04), e.g.:

| Line | Occurrence |
|------|------------|
| `:30` | `updateProfile: (data: Record<string, unknown>) => api.patch<AuthUser>(...)` |
| `:32` | `getProfile: (username) => api.get<Record<string, unknown>>(...)` |
| `:49-62` | `recipes.create/update/fork/compare/like/favourite/feature/saveNotes` — all `Record<string, unknown>` in and/or out |
| `:66` | `tasteNotes.hierarchy` |
| `:73-77` | `setups.list/create/get/update` |
| `:82-86` | `beans.list/get/create/update` |
| `:92-94` | `equipment.create/update` |
| `:137-140` | `follow.follow/followers/following` |

Consequences:

- Every consuming page/loader either casts (`as RecipeDetail`) or dot-drills into `unknown` — the compiler cannot catch a renamed field, and the D25 response schemas (which the API actually validates/documents against) have no compile-time link to the web app.
- Local shadow types have grown to fill the gap (e.g. `RecipeListItem` — originally defined in a page, per §4.6).

---

## Proposed Fix

1. **Export inferred response types from `@brewform/shared`**: in `packages/shared/src/schemas/responses/index.ts` (or a sibling `types` barrel), export `z.infer` types for each response schema — e.g. `export type RecipeDetailResponse = z.infer<typeof RecipeDetailResponseSchema>`. Follow the existing naming in `responses/_shared.ts` for envelope/pagination shapes. Where the schemas wrap data in the standard envelope, export the **data payload** types (what `api.get<T>` should receive after the client unwraps the envelope — match how `api/client.ts` currently returns data).
2. **Replace `Record<string, unknown>` in `apps/web/src/api/index.ts`** domain by domain, in this order (highest-traffic first): recipes → users/profile → follow → setups/beans/equipment → taste hierarchy. Request payloads use the corresponding *request* schema types already exported from `@brewform/shared/schemas` (same source the API validates with).
3. **Delete local shadow types** in pages where a shared type now exists (`RecipeListItem` should come from shared; keep a re-export for churn control if many files import it from its current location).
4. **Fix fallout honestly**: replacing `unknown` records with real types will surface latent mismatches in consuming pages (fields assumed present, wrong nullability). Fix consumers to match the schema — if the schema itself is wrong, that's an API bug to fix at the schema, not a cast.
5. **No runtime change**: this is compile-time typing only; do not add client-side `parse()` calls in this plan (runtime validation of responses is a separate decision).
6. Run `make ci`.

---

## Files to Change

| File | Change |
|------|--------|
| `packages/shared/src/schemas/responses/index.ts` (+ per-domain files) | Export inferred TS types |
| `apps/web/src/api/index.ts` | Replace all `Record<string, unknown>` generics/params with shared types |
| `apps/web/src/api/client.ts` | Only if generic plumbing needs a tweak for envelope unwrapping types |
| Consuming pages/loaders (`apps/web/src/pages/**`, `routes/**`) | Remove casts/shadow types; fix surfaced mismatches |

---

## Test Plan

- Primary gate is the type-checker: `deno check` / web `tsc` via `make ci` with zero `Record<string, unknown>` in `api/index.ts`.
- Existing web tests (loaders, recipe-list components, pages) pass unchanged — proves the derived types match actual fixture shapes.
- Add one type-level regression test: `// @ts-expect-error` on accessing a non-existent field of a derived response type (locks that the types are real, not `any` in disguise).
- Manual smoke: recipe list, recipe detail, profile, setups/beans pages render against the live API (`make dev`).

---

## Acceptance Criteria

- [ ] `grep -n "Record<string, unknown>" apps/web/src/api/index.ts` returns zero hits.
- [ ] All response/request types at the web boundary derive from `@brewform/shared` schemas (`z.infer`) — no hand-duplicated interfaces.
- [ ] `RecipeListItem` and similar shadow types sourced from shared.
- [ ] No new `as` casts introduced to paper over mismatches.
- [ ] `make ci` passes.

---

## Effort Estimate

**Medium** — ~1–1.5 days. Type exports are quick; the long tail is consumer fallout in pages, which is exactly the latent-bug surface this plan exists to expose.
