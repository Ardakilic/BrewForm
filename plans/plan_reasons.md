# Plan 06 — Test Infrastructure Concerns & Reasoning

## Summary

The refactor plan (`06-features-integration.md`) contains **incorrect assumptions about the web test stack** that would cause you to lose existing frontend behavioural test coverage during implementation.

---

## What Exists Today

### Two Test Systems in the Codebase

| System | Scope | Runner | Files |
|--------|-------|--------|-------|
| **Vitest + jsdom + React Testing Library** | `apps/web/src/` | `deno run -A npm:vitest run` (via `apps/web/deno.json` task `test`) | **37 regular** + 2 Vitest-based exploration/preservation = **39 files** |
| **Deno native (`@std/testing/bdd`)** | `apps/api/`, `packages/shared/`, + 3 web exploration/preservation/integration files | `deno test` (via Makefile `make test`, `make test-api`, `make test-shared`) | All API + shared tests + 3 Deno-native web files |

### Vitest Configuration Details

- **`apps/web/vitest.config.ts`** — Main config: jsdom environment, `@testing-library/jest-dom` setup, excludes `*.exploration.test.*`, `*.preservation.test.*`, `**/__tests__/*.integration.test.ts`
- **`apps/web/vitest.pbt.config.ts`** — Alternate config: specifically includes exploration/preservation tests (Vitest-based ones that use `render()` + RTL)
- **`apps/web/package.json`** — Has explicit devDependencies: `vitest@^4`, `@testing-library/react@^16.3`, `@testing-library/user-event@^14.6`, `@testing-library/jest-dom@^6.6`, `jsdom@^29`, `fast-check@^4`
- **`apps/web/src/test-setup.ts`** — Imports `@testing-library/jest-dom` (extends matchers)

### Test Invocation

| Command | What it runs | Coverage |
|---------|-------------|----------|
| `apps/web/deno.json` → `deno task test` | `deno run -A npm:vitest run` | 37 regular web tests (components, pages, utils) |
| `make test` / `make test-api` / `make test-shared` | `deno test apps/api/src/ packages/shared/src/` | API + shared package only |
| `make ci` | `deno task test-coverage` (same scope as `make test`) | Does **NOT** include web Vitest tests |

### Key Observation: **Web tests are NOT in CI**

The `make ci` pipeline runs `test-coverage` which only covers `apps/api/src/` and `packages/shared/src/`. The 39 Vitest web tests exist but must be run separately via `deno task --cwd apps/web test`.

---

## What the Plan Gets Wrong

### 1. Claims "No existing unit test files" (NEW-1 section)

> "No existing unit test files for these utilities have been confirmed"

**Reality:** `apps/web/src/utils/stat-cards.test.ts` already exists with 30+ tests including property-based tests using `fast-check`. This file uses **Vitest** imports (`import { describe, expect, it } from 'vitest'`).

### 2. Recommends Writing New Web Tests in Deno BDD Format

The plan's "Test syntax for all new tests" section says:
```ts
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
```

**Problem:** This is correct for `packages/shared/` and `apps/api/`, but **wrong for `apps/web/`**. The web app uses Vitest + RTL. Writing new web tests in Deno BDD would:
- Create inconsistency with the 39 existing tests
- Not integrate with the existing `vitest.config.ts` setup
- Not benefit from jsdom environment (needed for component tests)
- Not work with existing `test-setup.ts` (`@testing-library/jest-dom` matchers)

### 3. M6 `stat-cards.test.ts` — Would Conflict With Existing File

The plan proposes creating `apps/web/src/utils/stat-cards.test.ts` using Deno BDD syntax. **This file already exists** with comprehensive Vitest tests. The plan's proposed tests should extend the existing file using Vitest conventions.

### 4. Misses That Web Tests Need a Makefile Target

The plan notes "apps/web/ is not currently in the `make test` or `make test-shared` target" and suggests running manually. This is technically true for the **Makefile**, but `apps/web/deno.json` already defines a `test` task. The plan should recommend adding a `make test-web` target.

---

## What Should Change in the Plan

### A. Correct the "Test syntax" Blanket Statement

Add a second rule specifically for `apps/web/`:

```markdown
**Test syntax for `apps/web/` tests (components, pages, hooks, utils):**
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
```

### B. M6 Step: Extend Existing `stat-cards.test.ts`

Instead of creating a new file with Deno BDD imports, **append to the existing file** using Vitest conventions:

```ts
// Add to existing apps/web/src/utils/stat-cards.test.ts
describe('buildStatCards — TDS / extraction yield (M6)', () => {
  it('returns 5 cards when tds is null', () => { ... });
  it('returns 6 cards when tds is provided with valid inputs', () => { ... });
});
```

### C. M16a `unit-conversion.test.ts` — Correct Location & Syntax

The unit-conversion module lives in `packages/shared/src/`, so Deno BDD syntax is correct there. **No change needed.**

### D. M9 ContactPage — Write Tests in Vitest

The new `ContactPage.tsx` should have a `ContactPage.test.tsx` using the same Vitest + RTL pattern as all other page tests (see `HomePage.test.tsx` as a model).

### E. M16b RecipeVersionsPage — Write Tests in Vitest

Same as above — use Vitest + RTL for any component/page test under `apps/web/src/`.

### F. Add `make test-web` Target (or Document Existing Path)

```makefile
test-web: ## Run web (Vitest) tests
	docker compose run --rm --no-deps app deno run -A --cwd apps/web npm:vitest run
```

Or at minimum, add `deno task --cwd apps/web test` to the `ci` task.

### G. Add Web Tests to CI

The `ci` task in `deno.json` should include web tests:
```json
"ci": "deno task fmt-check && deno task lint && deno task check && deno task build && deno task test-coverage && deno task --cwd apps/web test"
```

---

## Files at Risk During Migration

If the plan is followed as-is without these corrections:

| File | Risk |
|------|------|
| `apps/web/src/utils/stat-cards.test.ts` | **Overwritten** — 236 lines of existing tests lost |
| All 37 regular Vitest test files | **Orphaned** — plan doesn't acknowledge they exist or need maintenance |
| `apps/web/vitest.config.ts` | **Ignored** — plan doesn't account for this config |
| `apps/web/vitest.pbt.config.ts` | **Ignored** — exploration/preservation tests become unmaintainable |

---

## Dual-System Design Intent

The codebase appears to have a deliberate split:

- **Vitest (jsdom)** — For tests that need DOM rendering (component tests, page tests, RTL queries)
- **Deno native (`@std/testing/bdd`)** — For pure logic tests that can run without a browser environment (API handlers, shared utilities, state machines)

Some `*.exploration.test.ts` and `*.preservation.test.ts` files use Deno BDD because they test **extracted pure logic** (not rendered components). Others (like `recipe-detail-preservation.preservation.test.tsx`) use Vitest + RTL because they render components.

The `vitest.config.ts` excludes exploration/preservation/integration tests from the default run, while `vitest.pbt.config.ts` specifically targets them. This is a conscious separation.

---

## Recommendation

1. **Update plan section "Test syntax for all new tests"** to distinguish between `apps/web/` (Vitest) and everything else (Deno BDD)
2. **Update M6** to extend existing `stat-cards.test.ts` not replace it
3. **Update M9 and M16b** to specify Vitest + RTL for new page tests
4. **Add a CI step** for web tests (currently a blind spot)
5. **Do not migrate** existing Vitest tests to Deno BDD — they work correctly and provide real DOM-level behavioural coverage that Deno BDD cannot replicate
