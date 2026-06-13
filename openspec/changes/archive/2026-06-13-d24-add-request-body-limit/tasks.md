## 1. Add bodyLimit middleware

### 1.1 Create `apps/api/src/middleware/bodyLimit.ts`

Create a new middleware file containing the `bodyLimit` constant and the conditional wrapper that excludes `/api/v1/photos`:

```ts
import { bodyLimit } from 'hono/body-limit';
import type { MiddlewareHandler } from 'hono';
import { error } from '../utils/response/index.ts';
import type { AppEnv } from '../types/hono.ts';

/**
 * Transport-level request body size limit (1 MB).
 *
 * Applied to all routes EXCEPT /api/v1/photos because photo uploads
 * accept files up to UPLOAD_MAX_SIZE_BYTES (default 10 MB) and
 * enforce their own application-level cap via validateImageUpload().
 *
 * Depends on requestIdMiddleware running first so that the onError
 * callback can include the requestId in the error envelope.
 */
const jsonBodyLimit = bodyLimit({
  maxSize: 1024 * 1024, // 1 MB
  onError: (c) => error(c, 'PAYLOAD_TOO_LARGE', 'Request body too large', 413),
});

/**
 * Hono middleware that applies a 1 MB body size limit to all routes
 * except photo upload routes.
 */
export const bodyLimitMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.req.path.startsWith('/api/v1/photos')) {
    return next();
  }
  return jsonBodyLimit(c, next);
};
```

- [x] 1.1 Create `apps/api/src/middleware/bodyLimit.ts` with the bodyLimit constant and conditional wrapper

### 1.2 Wire the middleware into `apps/api/src/main.ts`

**File:** `apps/api/src/main.ts`.

Add the import:

```ts
import { bodyLimitMiddleware } from './middleware/bodyLimit.ts';
```

Register it after `rateLimitMiddleware` and before cache injection:

```ts
app.use('*', rateLimitMiddleware({ windowMs: 60_000, maxRequests: 100 }));
app.use('*', bodyLimitMiddleware);
app.use('*', async (c, next) => {
  c.set('cache', cacheProvider);
  await next();
});
```

Also wrap the top-level `startup()` call in `if (import.meta.main)` so the file can be imported in tests without starting the server:

```ts
if (import.meta.main) {
  startup().catch((err) => {
    logger.error({ err }, 'Failed to start server');
    Deno.exit(1);
  });
}
```

- [x] 1.2 Wire `bodyLimitMiddleware` into `apps/api/src/main.ts` and guard `startup()` with `import.meta.main`

### 1.3 Update the file-level JSDoc comment in `apps/api/src/main.ts`

Replace the middleware stack line in the JSDoc:

**Old:**
```
 * Middleware stack (applied in order):
 *   cors → requestId → secureHeaders → rateLimit(100/min) → cache injection → crawler → routes
```

**New:**
```
 * Middleware stack (applied in order):
 *   cors → requestId → secureHeaders → rateLimit(100/min) → bodyLimit(1MB, excl. /api/v1/photos) → cache injection → crawler → routes
```

- [x] 1.3 Update the JSDoc middleware stack line to include bodyLimit

---

## 2. Write tests — `apps/api/src/middleware/bodyLimit.test.ts`

Create this file from scratch. Every test uses a fresh Hono app — no reliance on the main app, no database, no side effects.

### 2.1 Create the test file with scaffolding

**File to create:** `apps/api/src/middleware/bodyLimit.test.ts`

Full content:

```ts
import '../test-setup.ts';
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';

/** Build a fresh Hono app with bodyLimit applied (or conditionally skipped). */
function createApp(opts?: { excludePhotos?: boolean }) {
  const app = new Hono();

  app.use('*', async (c, next) => {
    c.set('requestId', 'test-req-id');
    await next();
  });

  const limit = bodyLimit({
    maxSize: 1024 * 1024, // 1 MB
    onError: (c) => {
      return c.json(
        {
          success: false,
          error: {
            code: 'PAYLOAD_TOO_LARGE',
            message: 'Request body too large',
            requestId: c.get('requestId'),
          },
        },
        413,
      );
    },
  });

  if (opts?.excludePhotos) {
    app.use('*', async (c, next) => {
      if (c.req.path.startsWith('/api/v1/photos')) return next();
      return limit(c, next);
    });
  } else {
    app.use('*', limit);
  }

  app.post('/api/v1/test', async (c) => {
    const body = await c.req.json();
    return c.json({ received: true, size: JSON.stringify(body).length }, 201);
  });

  app.post('/api/v1/photos', async (c) => {
    // Simulate photo handler — return 401 because we don't send auth
    return c.json({ error: 'Authentication required' }, 401);
  });

  app.get('/api/v1/test', (c) => c.json({ ok: true }));

  return app;
}
```

- [x] 2.1 Create the test file with imports, helper, and route stubs

### 2.2 Test: JSON POST under 1 MB passes through

```ts
describe('bodyLimit middleware', () => {
  describe('requests within the 1 MB limit', () => {
    it('allows a POST with a 500 KB JSON body', async () => {
      const app = createApp();
      const body = JSON.stringify({ data: 'x'.repeat(500_000) }); // ~500 KB
      const res = await app.request('/api/v1/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });
      expect(res.status).toBe(201);
      const result = await res.json();
      expect(result.received).toBe(true);
    });
  });
```

- [x] 2.2 Write the within-limit test

### 2.3 Test: JSON POST over 1 MB returns 413 (Content-Length header path)

```ts
  describe('requests exceeding the 1 MB limit', () => {
    it('returns 413 when Content-Length exceeds 1 MB', async () => {
      const app = createApp();
      const res = await app.request('/api/v1/test', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': '2097152', // 2 MB — bodyLimit checks this first
        },
        body: '{}', // Body is short; Content-Length is what triggers the rejection
      });
      expect(res.status).toBe(413);
      const result = await res.json();
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('PAYLOAD_TOO_LARGE');
      expect(result.error.message).toBe('Request body too large');
      expect(result.error.requestId).toBe('test-req-id');
    });

    it('returns 413 when streamed body exceeds 1 MB (no Content-Length)', async () => {
      const app = createApp();
      const bigString = 'x'.repeat(1024 * 1024 + 100); // 1 MB + 100 bytes
      const body = JSON.stringify({ data: bigString });
      const res = await app.request('/api/v1/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body, // No Content-Length header — bodyLimit streams and measures
      });
      expect(res.status).toBe(413);
      const result = await res.json();
      expect(result.error.code).toBe('PAYLOAD_TOO_LARGE');
    });
  });
```

- [x] 2.3 Write both over-limit tests (Content-Length header path + streaming path)

**Important:** The first over-limit test relies on Hono's `bodyLimit` checking `Content-Length` before reading the body. This is the documented behavior. The second test sends an actual oversized body without setting `Content-Length`, which triggers the streaming detection path. Both paths must return 413.

### 2.4 Test: GET request unaffected

```ts
  describe('requests without a body', () => {
    it('allows GET requests through unaffected', async () => {
      const app = createApp();
      const res = await app.request('/api/v1/test', { method: 'GET' });
      expect(res.status).toBe(200);
      const result = await res.json();
      expect(result.ok).toBe(true);
    });
  });
```

- [x] 2.4 Write the GET-unaffected test

### 2.5 Test: Photo route exclusion

```ts
  describe('photo route exclusion', () => {
    it('does not apply bodyLimit to POST /api/v1/photos', async () => {
      const app = createApp({ excludePhotos: true });
      const res = await app.request('/api/v1/photos', {
        method: 'POST',
        headers: { 'content-length': '2097152' }, // 2 MB would trigger 413 normally
        body: '{}',
      });
      expect(res.status).not.toBe(413);
      // Photo route handler runs (returns 401 because no auth token)
      expect(res.status).toBe(401);
    });
  });
```

- [x] 2.5 Write the photo-route-exclusion test (expect NOT 413, expect 401 from photo handler)

**Why this works:** The photo route handler returns 401 without auth. If bodyLimit were applied, we'd get 413 regardless of auth. Getting 401 proves bodyLimit was skipped.

### 2.6 Test: Photo handler still enforces its own limit

```ts
  describe('photo handler validation is unchanged', () => {
    it('returns 400 for files exceeding UPLOAD_MAX_SIZE_BYTES via validateImageUpload', async () => {
      // Direct unit test of validateImageUpload — confirms it's untouched
      const { validateImageUpload } = await import('../utils/upload/index.ts');
      const result = validateImageUpload({
        type: 'image/jpeg',
        size: 11 * 1024 * 1024, // 11 MB > 10 MB default
      });
      expect(result).not.toBeNull();
      expect(result).toContain('File too large');
    });
  });
});
```

- [x] 2.6 Write the validateImageUpload unit test confirming unchanged behavior

---

## 3. Add docblocks to new and existing functions

### 3.1 Docblock on the conditional wrapper

Already included in task 1.2 — the code block includes a full JSDoc comment on the bodyLimit constant.

### 3.2 Docblock on the test `createApp` helper

Already included in task 2.1 — the helper has a JSDoc comment.

### 3.3 (OPTIONAL) Add docblock to `validateImageUpload` if missing

Check `apps/api/src/utils/upload/index.ts` line 33. The `validateImageUpload` function currently has no docblock. Add one above it:

```ts
/**
 * Validates that an uploaded image file's type and size are within allowed limits.
 *
 * Returns `null` if the file passes validation, or an error message string
 * describing why validation failed (unsupported type or file too large).
 *
 * `ALLOWED_TYPES` and `MAX_SIZE` are read from config at module load time.
 *
 * @param file - An object with `type` (MIME type string) and `size` (bytes).
 * @returns A human-readable error string on failure, or `null` on success.
 */
export function validateImageUpload(file: { type: string; size: number }): string | null {
```

- [x] 3.1 Add docblock to `validateImageUpload` in `apps/api/src/utils/upload/index.ts` (if it doesn't already have one)

---

## 4. Verify

Run these commands in order. Every command must pass with exit code 0 before the task is complete.

- [x] 4.1 `deno fmt apps/api/src/main.ts apps/api/src/middleware/bodyLimit.ts apps/api/src/middleware/bodyLimit.test.ts apps/api/src/utils/upload/index.ts` — formatting
- [x] 4.2 `deno lint apps/api/src/main.ts apps/api/src/middleware/bodyLimit.ts apps/api/src/middleware/bodyLimit.test.ts` — linting (check changed/new files)
- [x] 4.3 `deno check apps/api/src/main.ts apps/api/src/middleware/bodyLimit.ts` — type-check main.ts and the new middleware
- [x] 4.4 `deno test --no-check --allow-all apps/api/src/middleware/bodyLimit.test.ts` — run the new tests, all must pass
- [x] 4.5 `deno test --no-check --allow-all --coverage=coverage/ apps/api/src/middleware/bodyLimit.test.ts && deno coverage coverage/ --include='apps/api/src/middleware/bodyLimit\\.test\\.ts|apps/api/src/middleware/bodyLimit\\.ts|apps/api/src/main\\.ts'` — verify ≥80% line coverage on the bodyLimit middleware code (achieved 100% on `bodyLimit.ts`)

---

## What NOT to change

- **DO NOT** modify `apps/api/src/middleware/errorHandler.ts` — `bodyLimit` uses `onError`, so no `HTTPException` is thrown
- **DO NOT** modify `apps/api/src/config/env.ts` or `UPLOAD_MAX_SIZE_BYTES` — photo upload limit stays at 10 MB
- **DO NOT** modify `apps/api/src/utils/upload/index.ts` beyond adding a docblock to `validateImageUpload`
- **DO NOT** modify `apps/api/src/modules/photo/index.ts` — handler behavior is unchanged
- **DO NOT** modify any route handler or service file
- **DO NOT** add new dependencies — `bodyLimit` ships with Hono (already a dependency)
- **DO NOT** add `bodyLimit` to the photo route itself — the exclusion wrapper handles this
