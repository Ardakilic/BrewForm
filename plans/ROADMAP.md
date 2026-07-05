# Debt Implementation Roadmap

> Derived from the 2026-07-04 plans/specs audit (openspec change `plans-specs-audit`). Tracks the
> open debt items (**D03**, **D34–D43**) in dependency-aware waves. Feature work (F01–F31) is
> tracked separately in [`FEATURE_SUGGESTIONS.md`](FEATURE_SUGGESTIONS.md); per-item status lives in
> [`TECHNICAL_DEBT.md`](TECHNICAL_DEBT.md).

**Rhythm:** one openspec change per item — `opsx:propose` → implement → `openspec archive`. Keep the
`Status` banner in each `plans/D*.md` and the `TECHNICAL_DEBT.md` ledger updated as each lands.

**Legend:** `P1` correctness/security · `P2` structural · `P3` polish.

---

## Wave 0 — Housekeeping (no code)

- [x] Archive the five verified-complete changes (`d27`, `d29`, `d30`, `d31`, `d33`) so the changes
      directory reflects reality _(done 2026-07-05; delta specs synced into `openspec/specs/`)_

## Wave 1 — Correctness & security (P1, small, independent)

- [ ] **D41** — Add `isNull(deletedAt)` guards to the three admin user mutations
      (`banUser`/`unbanUser`/`setUserAdminRole`). Trivial diff, real privilege-escalation edge; test
      plan mirrors the existing D19 tests. **Best first pick.**
- [ ] **D38** — Report-endpoint rate limit + `sanitize.ts` XSS tests + `AuthContext` silent catch.
      Three small, independently shippable pieces in one change.

## Wave 2 — Backend hygiene

- [ ] **D03** — Rewrite the raw SQL in `equipment/model.ts getRecipesUsingEquipment` with the
      Drizzle query builder; fold the duplicated count-branch visibility/`deletedAt` predicates into
      one shared condition set.
  - [ ] Do **D39 Tier 1 first** (equipment/vendor model tests) — the plan frames these as D03's
        regression net, since `equipment/model.ts` currently has zero tests.
- [ ] **D34** — Residual `any` elimination in the modules D05 never covered (preference, bean,
      setup, taste, badge, recipe/model, notify). Mechanical, guided by the exact file:line list.

## Wave 3 — Frontend structure (order matters)

- [ ] **D36** — Extract duplicated UI (HomePage `RecipeCard`, admin `BanDialog`×2, `Section`/`Field`
      helpers). _Do first: dedupe before translating so each string is touched once._
- [ ] **D37** — Consolidate error pages / remove dead `ErrorPage.tsx` exports. _Settles which error
      pages exist before they get localized._
- [ ] **D40** — Complete i18n for the 15 admin pages + 5 zero-`t()` user-facing pages + the partial
      `RecipeCreate`/`RecipeEdit` pages.

## Wave 4 — Independent fillers (anytime)

- [ ] **D42** — Typed web API boundary: replace `Record<string, unknown>` returns with types derived
      from the `schemas/responses/*` schemas (bigger, self-contained).
- [ ] **D43** — Add `createdAt` to the three recipe join tables (isolated Drizzle migration).
- [ ] **D35** — Remove untracked lint suppressions in `packages/shared` + api utils/middleware
      (tiny; could bundle into the D37 change).
- [ ] **D39** — Remaining test-coverage backfill tiers (ongoing background work after Tier 1).

---

## Outstanding manual follow-ups (not code)

- [ ] Close PR #54 (`feat/workspace-management`) with a note pointing to the archived
      `d31-deno-29-upgrade` as its superseding change, and delete the stale branch. _(d31 task 14.1
      — deferred to after this branch merges.)_
- [ ] (Optional) Run the deferred manual verifications from the archived changes:
      `EXPLAIN
      ANALYZE` on the cursor query (d27 task 1.5) and the `POST /api/v1/recipes`
      smoke test (d29 task 12.7).
