## Context

The repository contains 22 `deno-lint-ignore` directives (8 file-level, 14 inline). Every one of them targets a rule that `deno.json:58-64` already excludes from enforcement, so none of the directives do any lint work today. The plan at `plans/D09-fix-lint-suppressions.md` (revised June 2026) audited the situation and concluded that **no enforced-rule suppressions exist** — Phase 2 of that plan is vacuous. The only remaining cleanup is:

1. **`apps/api/src/modules/user/service.ts` carries three `as any` casts that are unnecessary** — TypeScript's rest-destructure typing already produces `Omit<UserSelect, 'passwordHash'>` automatically. Verified with an isolated Deno type-check. The casts and their suppressions can be removed entirely; the file becomes fully typed with zero lint suppressions, exceeding the AGENTS.md §"Code style" convention.
2. **Five test files use inline `// deno-lint-ignore no-explicit-any` directives** while the AGENTS.md convention is file-level. Normalising to file-level aligns the tests with the convention and matches the style already used in `apps/api/src/middleware/crawler.test.ts:1` and `apps/api/src/routes/sitemap.test.ts:1`.

Stakeholders: API service maintainers, anyone reading the user/profile code, future lint policy work.

## Goals / Non-Goals

**Goals:**
- Remove three unnecessary `as any` casts in `user/service.ts` and prove via `deno check` that the file is fully typed without them.
- Remove the three corresponding inline `// deno-lint-ignore no-explicit-any` comments in `user/service.ts` — the file should end with **zero** lint suppressions.
- Convert inline `// deno-lint-ignore no-explicit-any` directives in five test files to a single file-level `// deno-lint-ignore-file no-explicit-any` on line 1 of each file, matching AGENTS.md §"Code style" and the style of the two test files that already do this.
- Net reduction in directive count: **10 fewer directives total** (3 inline removed from `user/service.ts`; 11 inline across 4 test files collapsed into 4 file-level directives — 1 per file). The 8 file-level directives on production files are unchanged.
- All four `make` verification commands (`fmt-check`, `check`, `lint`, `test`) must pass.

**Non-Goals:**
- Modifying `deno.json` to remove `no-explicit-any` and `require-await` from the exclusion list (this is a larger refactor; explicitly out of scope per the plan §"Required Policy Change").
- Typing the loose `as any` mocks in test files (e.g. the `db: any = { ... }` mocks in `recipe/service.test.ts:393` and `recipe/service.preservation.test.ts:80-87`). The mocks deliberately use `any` to bypass Drizzle's typed query builder in a preservation/exploration test context. Only the suppression comment style is being normalised.
- Updating `AGENTS.md` — the existing convention already authorises the chosen directive forms.
- Adding new lint rules, modifying `deno fmt` settings, or changing CI configuration.

## Decisions

### Decision 1: Remove `as any` casts entirely, do not replace with explicit `Omit<>` types

**Choice:** Delete `as any` (and the preceding `// deno-lint-ignore no-explicit-any`) from `user/service.ts:22, 38, 67`. The rest pattern `const { passwordHash: _passwordHash, ...safe } = user;` infers `safe: Omit<UserSelect, 'passwordHash'>` automatically. Verified with an isolated `deno check`.

**Alternatives considered:**
- *Replace `as any` with explicit `Omit<typeof users.$inferSelect, 'passwordHash'>` cast* — adds noise; TypeScript already produces this exact type. Rejected as redundant.
- *Define a named `SafeUser` type in `@brewform/shared` and use it everywhere* — cleaner long-term, but expands the scope into a shared-type refactor. The plan and the user's instruction keep this change minimal. Rejected.
- *Suppress at the file level with `// deno-lint-ignore-file no-explicit-any require-await` (Path B from the plan evaluation)* — leaves the unnecessary `as any` in place. Rejected because Path C (this design) is strictly better: same risk, smaller blast radius, fewer directives, and exceeds the AGENTS.md convention.

### Decision 2: Use the AGENTS.md-prescribed both-rules form for test file directives

**Choice:** Test files get `// deno-lint-ignore-file no-explicit-any` on line 1 (not the both-rules form). The two test files that already use file-level suppressions (`crawler.test.ts`, `sitemap.test.ts`) use the single-rule form, and the test mocks legitimately need `any` for Drizzle query builder substitution but never need to suppress `require-await`. Matching the single-rule form keeps the change minimal and avoids over-suppression.

**Alternatives considered:**
- *Use the both-rules form `// deno-lint-ignore-file no-explicit-any require-await` to match AGENTS.md verbatim* — AGENTS.md says "module files use…", but the existing test-file convention (predating this change) is the single-rule form. Following the existing test-file pattern is more important than mirroring AGENTS.md exactly, since the lint policy actually excludes both rules. Rejected.

### Decision 3: Placement — directive on line 1, blank line on line 2, content from line 3

**Choice:** File-level directive goes on line 1 of every modified test file, with a blank line on line 2 and the existing content (imports, docblocks) starting on line 3. This matches `crawler.test.ts:1-2` and `sitemap.test.ts:1-2`.

### Decision 4: Convert all inline `// deno-lint-ignore no-explicit-any` directives in test files, including trailing-comment style

**Choice:** `apps/api/src/modules/recipe/service.preservation.test.ts:160,181` use the non-standard trailing-comment form `const w = where as any; // deno-lint-ignore no-explicit-any`. When converting to file-level, the entire suppression surface in the file is covered by the line-1 directive, so these trailing comments (and the 4 other inline ones in the same file) are simply removed. The two `as any` casts at L160 and L181 are preserved — only the comment is removed.

### Decision 5: Do not touch `apps/api/src/middleware/crawler.test.ts` or `apps/api/src/routes/sitemap.test.ts`

**Choice:** These two test files already use the file-level form on line 1. They are out of scope for the conversion step.

## Risks / Trade-offs

- **[Risk] Removing `as any` from `user/service.ts` could fail `deno check` if a future Drizzle schema change makes the inferred rest-destructure type broader than expected.** → **Mitigation:** run `make check` immediately after the edit; the type assertion is structurally identical, so any regression would surface as a compile error in this same PR.
- **[Risk] File-level `// deno-lint-ignore-file no-explicit-any` suppresses the rule for the entire test file, hiding any future real `any` usage in legitimate test setup code.** → **Mitigation:** `no-explicit-any` is already excluded by `deno.json`, so the directive has zero behavioural effect on lint output. The risk is purely cosmetic / "rule by convention" — same risk that exists for every other file-level suppression in the repo today. Acceptable.
- **[Risk] Net directive count change might surprise readers who track this metric.** → **Mitigation:** before/after counts are documented in the verification section of `tasks.md` and in the PR description. The reduction is a feature, not a bug.
- **[Trade-off] Test files with a single inline suppression end up with the same number of directives (1 file-level) — no net reduction in those files.** → Acceptable; the goal is consistency with AGENTS.md, not directive-count reduction.
- **[Trade-off] Loose `as any` mocks in test files (e.g. `db: any = { ... }`) remain in place.** → Out of scope; typing those would require introducing a mock-Drizzle type or a test helper, expanding the change. Acceptable for this PR.

## Migration Plan

This is a single-PR refactor with no runtime or API change. Rollback is a `git revert`.

**Pre-merge:**
1. Apply edits to the 5 files listed in `tasks.md` §"Implementation".
2. Run `make fmt && make check && make lint && make test` and confirm all four pass.
3. Verify directive count: **22 → 12** (-10). The 8 existing file-level directives on production files are unchanged. Three inline directives in `user/service.ts` are removed (no replacement). 11 inline directives across 4 test files are replaced by 4 file-level directives (one per file). Net: 22 - 3 - 11 + 4 = 12.
4. Open PR with the diff and a one-line description: "Remove unnecessary `as any` casts in `user/service.ts`; normalise test file suppressions to file-level per AGENTS.md convention."

**Post-merge:** none. No database migration, no deploy step, no config change.

**Rollback:** `git revert <merge-sha>` — the change is purely a style/type refinement and is fully reversible.

## Open Questions

None. All decisions resolved before this design was finalised. The only judgement call — whether to type the loose test mocks — is explicitly out of scope and tracked for a future change.
