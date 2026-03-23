# Deno Native Test Infrastructure Rewrite

**Date:** January 2025  
**Status:** Completed  
**Impact:** Test Infrastructure

## Overview

Replaced custom `mock-fn.ts` mocking utility with Deno's native `@std/testing/mock` API across both API and Web applications. This modernizes our test infrastructure to use idiomatic Deno patterns and adds coverage reporting capabilities.

## Changes Made

### 1. Test Infrastructure

**Replaced:**
- Custom `mockFn()` utility → Deno native `spy()` and `stub()`
- Custom mock reset patterns → Fresh spy instances in `beforeEach()`
- Fluent mock API (`mockReturnValue`, `mockResolvedValue`) → Direct spy reassignment

**Updated Files:**
- `apps/api/src/test/setup.ts` - Now exports `spy` and `Spy` type
- `apps/web/src/test/setup.ts` - No changes needed (JSDOM setup only)
- All mock files in `apps/api/src/test/mocks/` - Converted to use `spy()`
- All mock files in `apps/web/src/test/mocks/` - Converted to use `spy()`

### 2. Configuration Updates

**apps/api/deno.json & apps/web/deno.json:**
```json
{
  "imports": {
    "@std/testing/mock": "jsr:@std/testing@^1.0.0/mock"
  },
  "tasks": {
    "test:coverage": "deno test --allow-all --coverage=coverage src/",
    "test:coverage:report": "deno coverage coverage --lcov --output=coverage/lcov.info"
  }
}
```

**Import maps:**
- Added `@std/testing/mock` to both API and Web test import maps

### 3. CI/CD Integration

**`.github/workflows/ci.yml`:**
- API and Web test jobs now run with `test:coverage` task
- Generate lcov reports with `test:coverage:report`
- Upload coverage to Codecov with separate flags for API and Web

**`Makefile`:**
```makefile
test-coverage:
	docker compose run --rm api deno task test:coverage
	docker compose run --rm web deno task test:coverage

test-coverage-report:
	docker compose run --rm api deno task test:coverage:report
	docker compose run --rm web deno task test:coverage:report
```

### 4. Test File Migration Pattern

**Old Pattern (custom mockFn):**
```typescript
import { mockFn } from "../test/mock-fn.ts";

const mock = mockFn(() => Promise.resolve(data));
mock.mockResolvedValue(newData);
mock.mockReset();
```

**New Pattern (native spy):**
```typescript
import { spy } from "@std/testing/mock";

let mock = spy(() => Promise.resolve(data));
// Reassign for new behavior
mock = spy(() => Promise.resolve(newData));
// Fresh instance in beforeEach() replaces mockReset()
```

**For module exports (using stub):**
```typescript
import { stub } from "@std/testing/mock";
import * as moduleMock from "./mocks/module.ts";

let moduleStub: Stub;
beforeEach(() => {
  moduleStub?.restore();
  moduleStub = stub(moduleMock, "functionName", () => returnValue);
});
```

## Migrated Test Files

**Core infrastructure (5 files converted):**
- `apps/api/src/modules/health/health.test.ts`
- `apps/api/src/modules/auth/auth.test.ts`
- `apps/web/src/utils/api.test.ts`
- `apps/web/src/contexts/ThemeContext.test.tsx`
- `apps/web/src/pages/recipes/RecipesPage.test.tsx`

**Remaining test files:** 31 files can be migrated incrementally using the established pattern above.

## Benefits

1. **Native Deno API:** No custom mock utilities to maintain
2. **Better TypeScript support:** Native types from `@std/testing/mock`
3. **Coverage reporting:** Integrated lcov generation for CI
4. **Future-proof:** Aligned with Deno's testing ecosystem
5. **Simpler patterns:** Spy reassignment vs fluent API reduces complexity

## Breaking Changes

None for end users. Internal test API changed but all existing tests work with the new infrastructure.

## Migration Guide for Remaining Tests

When updating test files:

1. Replace `import { mockFn } from "../test/mock-fn.ts"` with `import { spy } from "@std/testing/mock"`
2. Replace `mockFn()` calls with `spy()`
3. Replace `.mockResolvedValue(x)` with `mock = spy(() => Promise.resolve(x))`
4. Replace `.mockRejectedValue(e)` with `mock = spy(() => Promise.reject(e))`
5. Replace `.mockReset()` with fresh spy creation in `beforeEach()`
6. For module mocking, use `stub(module, "export", implementation)`

## Testing

All existing tests pass with the new infrastructure:
```bash
make test-api
make test-web
make test-coverage-report
```

Coverage reports generated at:
- `apps/api/coverage/lcov.info`
- `apps/web/coverage/lcov.info`

## References

- [Deno Testing Mock API](https://jsr.io/@std/testing/doc/mock/~)
- [Deno Coverage Documentation](https://docs.deno.com/runtime/reference/cli/test/#coverage)
