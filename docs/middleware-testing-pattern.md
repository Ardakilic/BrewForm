# Middleware Testing Pattern: The `_impl/` Approach

## Overview

The BrewForm API uses a specialized directory structure for middleware to enable comprehensive testing while maintaining existing mock behavior for module tests. This document explains the `_impl/` pattern, its rationale, and implementation details.

## Problem Statement

### The Testing Challenge

Our test infrastructure uses `import_map.json` to mock middleware files during module tests. This creates a conflict when trying to test the middleware themselves:

```
apps/api/src/test/import_map.json
{
  "imports": {
    "../middleware/auth.ts": "./mocks/auth-middleware.ts",
    "../middleware/errorHandler.ts": "./mocks/error-handler.ts",
    "../middleware/rateLimit.ts": "./mocks/rate-limit.ts"
  }
}
```

**The Dilemma:**
- Module tests need mocked middleware (to isolate business logic)
- Middleware tests need real middleware (to test actual behavior)
- Both must run under a single test command
- Both must contribute to unified coverage reporting

## Solution: The `_impl/` Pattern

### Directory Structure

```
apps/api/src/middleware/
├── _impl/                    # Implementation directory
│   ├── auth.ts              # Real authentication logic
│   ├── errorHandler.ts      # Real error handling logic
│   ├── logger.ts            # Real logging logic
│   ├── rateLimit.ts         # Real rate limiting logic
│   └── requestId.ts         # Real request ID logic
├── auth.ts                  # Thin re-export wrapper
├── auth.test.ts             # Tests import from _impl/
├── errorHandler.ts          # Thin re-export wrapper
├── errorHandler.test.ts     # Tests import from _impl/
├── logger.ts                # Thin re-export wrapper
├── logger.test.ts           # Tests import from _impl/
├── rateLimit.ts             # Thin re-export wrapper
├── rateLimit.test.ts        # Tests import from _impl/
├── requestId.ts             # Thin re-export wrapper
└── requestId.test.ts        # Tests import from _impl/
```

### How It Works

#### 1. Implementation Files (`_impl/*.ts`)

Contains the actual middleware logic with updated import paths:

```typescript
// apps/api/src/middleware/_impl/auth.ts
import { createMiddleware } from 'hono/factory';
import { verifyAccessToken } from '../../utils/auth/index.ts';  // Note: ../../ instead of ../
import { getPrisma } from '../../utils/database/index.ts';
import { getLogger } from '../../utils/logger/index.ts';

export const authMiddleware = createMiddleware(async (c, next) => {
  // ... actual implementation
});

export const requireAuth = createMiddleware(async (c, next) => {
  // ... actual implementation
});
```

#### 2. Re-export Wrappers (`*.ts`)

Thin files that simply re-export from `_impl/`:

```typescript
// apps/api/src/middleware/auth.ts
export * from './_impl/auth.ts';
export { default } from './_impl/auth.ts';
```

**Why this works:**
- Production code imports from `src/middleware/auth.ts` → gets real implementation ✓
- Module tests import `../middleware/auth.ts` → import map redirects to mock ✓
- Middleware tests import from `src/middleware/_impl/auth.ts` → NOT in import map, gets real code ✓

#### 3. Test Files (`*.test.ts`)

Import directly from `_impl/` to test real implementations:

```typescript
// apps/api/src/middleware/auth.test.ts
import { authMiddleware, requireAuth } from './_impl/auth.ts';
import * as databaseMock from '../test/mocks/database.ts';
import * as authUtilsMock from '../test/mocks/auth-utils.ts';

describe('Auth Middleware', () => {
  it('should authenticate valid tokens', async () => {
    // Test uses real authMiddleware with mocked dependencies
  });
});
```

## Benefits

### 1. Unified Test Execution
```bash
# Single command runs ALL tests
make test-api

# Includes:
# - Module tests (with mocked middleware)
# - Middleware tests (with real middleware)
# - Utility tests
```

### 2. Unified Coverage Reporting
```bash
make test-coverage
make test-coverage-report

# Generates single LCOV file:
apps/api/coverage/lcov.info
```

### 3. Isolated Testing
- Middleware tests use **real middleware code**
- Dependencies (database, logger) are **mocked**
- Tests verify actual middleware behavior without external dependencies

### 4. Zero Production Impact
- No changes to production code behavior
- Import paths remain the same for application code
- Only structural reorganization

## Example: Testing Authentication Middleware

### Before (Impossible)

```typescript
// ❌ This would import the mock, not the real middleware
import { authMiddleware } from './auth.ts';

describe('Auth Middleware', () => {
  it('should verify tokens', async () => {
    // Testing the mock, not the real implementation!
  });
});
```

### After (Working)

```typescript
// ✓ Imports real implementation
import { authMiddleware } from './_impl/auth.ts';
import { spy, stub } from '@std/testing/mock';
import * as authUtilsMock from '../test/mocks/auth-utils.ts';

describe('Auth Middleware', () => {
  it('should verify tokens', async () => {
    // Setup: stub the token verification
    const verifyStub = stub(
      authUtilsMock,
      'verifyAccessToken',
      () => Promise.resolve({ userId: 'user_123', sessionId: 'session_123' })
    );

    // Test: real middleware with mocked dependency
    const app = new Hono();
    app.use('*', authMiddleware);
    app.get('/test', (c) => c.json({ user: c.get('user') }));

    const response = await app.request('/test', {
      headers: { Authorization: 'Bearer valid_token' }
    });

    // Verify: middleware correctly processed the token
    expect(response.status).toBe(200);
    verifyStub.restore();
  });
});
```

## Implementation Checklist

When adding new middleware:

- [ ] Create implementation in `src/middleware/_impl/[name].ts`
- [ ] Update relative imports (`../` → `../../`)
- [ ] Create re-export wrapper in `src/middleware/[name].ts`
- [ ] Create test file `src/middleware/[name].test.ts`
- [ ] Import from `_impl/` in test file
- [ ] Verify tests run with `make test-api`
- [ ] Check coverage with `make test-coverage-report`

## Common Patterns

### Testing with Mocked Dependencies

```typescript
import { beforeEach, describe, it } from '@std/testing';
import { expect } from '@std/expect';
import { spy } from '@std/testing/mock';
import { myMiddleware } from './_impl/myMiddleware.ts';
import { createMockPrisma } from '../test/setup.ts';
import * as databaseMock from '../test/mocks/database.ts';

describe('My Middleware', () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    databaseMock.setPrisma(mockPrisma);
  });

  it('should do something', async () => {
    // Customize mock behavior
    mockPrisma.user.findUnique = spy(() => 
      Promise.resolve({ id: '123', email: 'test@example.com' })
    );

    // Test middleware
    const app = new Hono();
    app.use('*', myMiddleware);
    // ... assertions
  });
});
```

### Testing Error Handling

```typescript
it('should handle errors gracefully', async () => {
  // Setup: mock to throw error
  mockPrisma.user.findUnique = spy(() => 
    Promise.reject(new Error('Database error'))
  );

  // Test: middleware should catch and handle
  const app = new Hono();
  app.use('*', myMiddleware);
  app.get('/test', (c) => c.json({ success: true }));

  const response = await app.request('/test');
  
  // Verify: error was handled properly
  expect(response.status).toBe(500);
});
```

## Migration Guide

If you need to add tests to existing middleware:

1. **Create `_impl/` directory:**
   ```bash
   mkdir -p apps/api/src/middleware/_impl
   ```

2. **Move implementation:**
   ```bash
   cp apps/api/src/middleware/auth.ts apps/api/src/middleware/_impl/auth.ts
   ```

3. **Update imports in `_impl/` file:**
   ```typescript
   // Change all relative imports
   - import { foo } from '../utils/bar.ts';
   + import { foo } from '../../utils/bar.ts';
   ```

4. **Convert original file to re-export:**
   ```typescript
   // apps/api/src/middleware/auth.ts
   export * from './_impl/auth.ts';
   export { default } from './_impl/auth.ts';
   ```

5. **Create test file:**
   ```typescript
   // apps/api/src/middleware/auth.test.ts
   import { authMiddleware } from './_impl/auth.ts';
   // ... write tests
   ```

6. **Verify:**
   ```bash
   make test-api
   make test-coverage-report
   ```

## Troubleshooting

### "Cannot find module" errors

**Problem:** Import paths are incorrect after moving to `_impl/`

**Solution:** Update all relative imports to go up one more level:
- `../utils/` → `../../utils/`
- `../config/` → `../../config/`

### Tests import mocked middleware

**Problem:** Test file imports from wrapper instead of `_impl/`

**Solution:** Update import in test file:
```typescript
- import { middleware } from './middleware.ts';
+ import { middleware } from './_impl/middleware.ts';
```

### Coverage not including `_impl/` files

**Problem:** Coverage report doesn't show `_impl/` directory

**Solution:** Ensure tests are actually importing from `_impl/` and running. Check with:
```bash
deno test --allow-all --no-check src/middleware/*.test.ts
```

## Related Documentation

- [Deno Testing Guide](https://docs.deno.com/runtime/manual/basics/testing/)
- [Hono Testing Documentation](https://hono.dev/guides/testing)
- [Test Mocking Patterns](./test-mocking-patterns.md) *(if exists)*

## Summary

The `_impl/` pattern elegantly solves the middleware testing challenge by:
- Separating implementation from public API
- Allowing selective mocking via import maps
- Enabling comprehensive middleware testing
- Maintaining unified test execution and coverage
- Requiring zero changes to production code behavior

This pattern can be applied to any code that needs both mocking (for consumer tests) and direct testing (for implementation tests).
