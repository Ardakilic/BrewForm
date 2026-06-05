## Why

The repository's lint policy in `deno.json` excludes five rules (`no-explicit-any`, `require-await`, `no-empty`, `no-import-prefix`, `no-unversioned-import`). All 22 `deno-lint-ignore` directives in the codebase target these excluded rules, so none of them are doing any lint work today. The original plan at `plans/D09-fix-lint-suppressions.md` recommends an optional cosmetic fix, but the most valuable fix it missed is that the three `as any` casts in `apps/api/src/modules/user/service.ts` are unnecessary — TypeScript's rest-destructure typing already produces `Omit<UserSelect, 'passwordHash'>` automatically, so the casts (and their suppressions) can be removed entirely. Five test files also carry inline `// deno-lint-ignore no-explicit-any` directives that should be normalised to file-level for consistency with AGENTS.md §"Code style".

## What Changes

- **Remove unnecessary `as any` casts in `apps/api/src/modules/user/service.ts`** — the three `as any` casts at lines 22, 38, 67 are defensive cruft; TypeScript correctly types rest destructuring without them. Remove each `as any` and the corresponding `// deno-lint-ignore no-explicit-any` comment that precedes it. The file becomes fully typed with **zero** lint suppressions, exceeding the AGENTS.md convention.
- **Normalise test file suppressions to file-level** — convert inline `// deno-lint-ignore no-explicit-any` directives in 5 test files to a single file-level `// deno-lint-ignore-file no-explicit-any require-await` on line 1, the full module-file directive documented in AGENTS.md §"Code style" as the convention for `**/*.{ts,tsx}` module files. The exact directive to use is `// deno-lint-ignore-file no-explicit-any require-await` so future edits do not revert to the shorter single-rule form. Files affected: `apps/api/src/modules/user/service.exploration.test.ts` (2 inline), `apps/api/src/modules/user/service.preservation.test.ts` (2 inline), `apps/api/src/modules/recipe/service.test.ts` (1 inline), `apps/api/src/modules/recipe/service.preservation.test.ts` (6 inline, including 2 in trailing-comment style at lines 160, 181 that will be removed in the conversion).
- **No policy change to `deno.json`** — the lint exclusion list is preserved. Removing `no-explicit-any` and `require-await` from the excluded rules is a separate, larger refactor explicitly out of scope.
- **No new dependencies, no API or behaviour changes, no documentation updates to AGENTS.md** — the existing convention already authorises the chosen directive forms.

## Capabilities

### New Capabilities
- *(none — this is a refactor, not a new capability)*

### Modified Capabilities
- *(none — no requirements are changing, only the suppression style and the presence of unnecessary `as any` casts)*

## Impact

- **Code touched**: 6 files in `apps/api/` and `packages/` — see design.md for the exact list and diff plan.
  - `apps/api/src/modules/user/service.ts` — 3 casts removed, 3 inline suppressions removed
  - `apps/api/src/modules/user/service.exploration.test.ts` — 2 inline suppressions collapsed to 1 file-level
  - `apps/api/src/modules/user/service.preservation.test.ts` — 2 inline suppressions collapsed to 1 file-level
  - `apps/api/src/modules/recipe/service.test.ts` — 1 inline suppression collapsed to 1 file-level
  - `apps/api/src/modules/recipe/service.preservation.test.ts` — 6 inline suppressions collapsed to 1 file-level
  - *(no change to `apps/api/src/middleware/crawler.test.ts` or `apps/api/src/routes/sitemap.test.ts` — they already use file-level suppressions)*
- **API surface**: unchanged. Removing `as any` is a type-level refinement only.
- **Public types**: unchanged. `Omit<UserSelect, 'passwordHash'>` is structurally identical to the previous `any` cast result.
- **Runtime behaviour**: unchanged. No code paths differ; only types tighten.
- **Build / CI**: `make fmt-check`, `make check`, `make lint`, `make test` must all pass. No new tasks added to `deno.json`.
- **Dependencies**: none added or removed.
- **AGENTS.md**: no update needed; the existing convention already authorises the chosen directive forms.
