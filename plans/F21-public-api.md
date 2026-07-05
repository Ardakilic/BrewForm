# F21 — Public API with API Keys

> **Validation status (2026-07-04): ✅ Valid**
>
> - Net-new `apiKeys` table; self-contained.
> - Fix: `hashApiKey` is typed as returning `string` but actually returns a `Promise` — correct the return type / await it.
> - `unauthorized`/`forbidden` helpers exist in utils/response; align the auth guard with the repo's RequireAuth pattern.

## Overview

Create a versioned public API with API key authentication, per-key rate limiting, and developer documentation. Users can generate API keys, manage scopes, and access BrewForm data programmatically.

## Goals

1. Enable API key-based authentication for programmatic access
2. Support per-key rate limiting with configurable limits
3. Provide API key management UI in user settings
4. Enhance existing OpenAPI/Swagger documentation
5. Maintain backward compatibility with JWT auth

## User Stories

| # | As a… | I want to… | So that… |
|---|-------|-----------|----------|
| US-1 | Authenticated user | Generate an API key | I can access the API programmatically |
| US-2 | Authenticated user | Name my API keys | I can identify which key is for which integration |
| US-3 | Authenticated user | Set scopes on my API keys | I can limit what each key can access |
| US-4 | Authenticated user | See when my API key was last used | I can monitor for unauthorized use |
| US-5 | Authenticated user | Revoke an API key | I can disable compromised or unused keys |
| US-6 | Authenticated user | See my API usage and rate limit status | I can manage my quota |
| US-7 | Developer | Read API documentation at /api/v1/docs | I can understand how to use the API |

## Technical Design

### Database Schema (Drizzle ORM)

Add to `packages/db/src/schema.ts`:

```ts
export const apiKeys = pgTable(
  'api_key',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
    name: varchar('name', { length: 255 }).notNull(),
    keyHash: varchar('key_hash', { length: 64 }).notNull(), // SHA-256 hash
    prefix: varchar('prefix', { length: 8 }).notNull(), // First 8 chars for display
    scopes: text('scopes').array().notNull().default(['read']), // e.g., ['read', 'write']
    rateLimit: integer('rate_limit').notNull().default(1000), // requests per day
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('api_key_user_id_idx').on(table.userId),
    index('api_key_key_hash_idx').on(table.keyHash),
    index('api_key_deleted_at_idx').on(table.deletedAt),
    unique('api_key_key_hash_unique').on(table.keyHash),
  ],
);
```

**Relations to add:**

```ts
export const usersRelations = relations(users, ({ one, many }) => ({
  // ... existing relations
  apiKeys: many(apiKeys),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id],
  }),
}));
```

### Migration

Run `make db-generate` to produce the SQL migration. **Never write manual SQL.**

### API Key Generation

```ts
/**
 * Generate a new API key.
 * Returns the raw key (shown once) and the hash (stored in DB).
 */
export function generateApiKey(): { rawKey: string; keyHash: string; prefix: string } {
  const rawKey = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const keyHash = hashApiKey(rawKey);
  const prefix = rawKey.slice(0, 8);
  return { rawKey, keyHash, prefix };
}

/**
 * Hash an API key using SHA-256 for storage.
 */
export function hashApiKey(key: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  // Use SubtleCrypto for SHA-256
  return crypto.subtle.digest('SHA-256', data).then(hash => {
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  });
}
```

### Middleware: `middleware/apiKey.ts`

```ts
import type { Context, Next } from 'hono';
import { db } from '@brewform/db';
import { apiKeys } from '@brewform/db/schema';
import { and, eq, isNull, gt } from 'drizzle-orm';
import { cacheProvider } from '../utils/cache/singleton.ts';
import { unauthorized, forbidden } from '../utils/response/index.ts';

/**
 * API key authentication middleware.
 * Validates X-API-Key header, injects userId into context.
 * Applies per-key rate limiting using cache infrastructure.
 */
export async function apiKeyMiddleware(c: Context, next: Next) {
  const apiKey = c.req.header('X-API-Key');
  if (!apiKey) return unauthorized(c, 'Missing API key');

  const keyHash = await hashApiKey(apiKey);
  const result = await db.select().from(apiKeys)
    .where(
      and(
        eq(apiKeys.keyHash, keyHash),
        isNull(apiKeys.deletedAt),
      )
    )
    .limit(1);

  const key = result[0];
  if (!key) return unauthorized(c, 'Invalid API key');

  // Check expiration
  if (key.expiresAt && key.expiresAt < new Date()) {
    return unauthorized(c, 'API key has expired');
  }

  // Per-key rate limiting
  const now = Date.now();
  const windowMs = 24 * 60 * 60 * 1000; // 24 hours
  const rateLimitKey = ['api-rate-limit', key.id];
  const entry = await cacheProvider.get<{ count: number; resetAt: number }>(rateLimitKey);

  const current = entry || { count: 0, resetAt: now + windowMs };
  if (now > current.resetAt) {
    current.count = 0;
    current.resetAt = now + windowMs;
  }
  current.count++;

  await cacheProvider.set(rateLimitKey, current, { ttlMs: windowMs });

  c.header('X-RateLimit-Limit', String(key.rateLimit));
  c.header('X-RateLimit-Remaining', String(Math.max(0, key.rateLimit - current.count)));
  c.header('X-RateLimit-Reset', String(Math.ceil(current.resetAt / 1000)));

  if (current.count > key.rateLimit) {
    return c.json({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'API key rate limit exceeded' },
    }, 429);
  }

  // Update lastUsedAt asynchronously
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, key.id))
    .execute()
    .catch(() => {});

  c.set('userId', key.userId);
  c.set('user', null); // API key auth doesn't load full user
  await next();
}
```

### Module: `modules/api-key/`

#### `model.ts`

```ts
import { db } from '@brewform/db';
import { apiKeys } from '@brewform/db/schema';
import { and, count, desc, eq, isNull } from 'drizzle-orm';

export async function findById(id: string) {
  const result = await db.select().from(apiKeys)
    .where(and(eq(apiKeys.id, id), isNull(apiKeys.deletedAt)))
    .limit(1);
  return result[0] ?? null;
}

export async function findByUserId(userId: string) {
  return db.select().from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.deletedAt)))
    .orderBy(desc(apiKeys.createdAt));
}

export async function create(data: typeof apiKeys.$inferInsert) {
  const [result] = await db.insert(apiKeys).values(data).returning();
  return result;
}

export async function softDelete(id: string) {
  const [result] = await db.update(apiKeys)
    .set({ deletedAt: new Date() })
    .where(and(eq(apiKeys.id, id), isNull(apiKeys.deletedAt)))
    .returning();
  return result ?? null;
}
```

#### `service.ts`

```ts
import * as model from './model.ts';
import { generateApiKey, hashApiKey } from './utils.ts';
import { createLogger } from '../../utils/logger/index.ts';

const logger = createLogger('api-key-service');

export async function createApiKey(userId: string, name: string, scopes: string[], rateLimit?: number) {
  const { rawKey, keyHash, prefix } = await generateApiKey();
  const key = await model.create({
    userId,
    name,
    keyHash,
    prefix,
    scopes,
    rateLimit: rateLimit || 1000,
  });
  logger.info({ userId, keyId: key.id }, 'API key created');
  return { key, rawKey }; // rawKey shown once
}

export async function listApiKeys(userId: string) {
  return model.findByUserId(userId);
}

export async function revokeApiKey(userId: string, keyId: string) {
  const key = await model.findById(keyId);
  if (!key) throw new Error('KEY_NOT_FOUND');
  if (key.userId !== userId) throw new Error('FORBIDDEN');
  await model.softDelete(keyId);
  logger.info({ userId, keyId }, 'API key revoked');
}
```

#### `index.ts`

```ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import { error, success } from '../../utils/response/index.ts';
import type { AppEnv } from '../../types/hono.ts';

const apiKey = new Hono<AppEnv>();

apiKey.post('/', authMiddleware, zValidator('json', z.object({
  name: z.string().min(1).max(255),
  scopes: z.array(z.enum(['read', 'write'])).default(['read']),
  rateLimit: z.number().int().min(100).max(10000).optional(),
})), async (c) => {
  const userId = c.get('userId') as string;
  const { name, scopes, rateLimit } = c.req.valid('json');
  try {
    const result = await service.createApiKey(userId, name, scopes, rateLimit);
    return success(c, { key: result.key, rawKey: result.rawKey }, 201);
  } catch (err) {
    throw err;
  }
});

apiKey.get('/', authMiddleware, async (c) => {
  const userId = c.get('userId') as string;
  const keys = await service.listApiKeys(userId);
  return success(c, keys);
});

apiKey.delete('/:id', authMiddleware, async (c) => {
  const userId = c.get('userId') as string;
  const keyId = c.req.param('id')!;
  try {
    await service.revokeApiKey(userId, keyId);
    return success(c, { message: 'API key revoked' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'KEY_NOT_FOUND') return error(c, 'NOT_FOUND', 'API key not found', 404);
    if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not your API key', 403);
    throw err;
  }
});

export default apiKey;
```

### Shared Schemas

Add `packages/shared/src/schemas/api-key.ts`:

```ts
import { z } from 'zod';

export const ApiKeyCreateSchema = z.object({
  name: z.string().min(1).max(255),
  scopes: z.array(z.enum(['read', 'write'])).default(['read']),
  rateLimit: z.number().int().min(100).max(10000).optional(),
});
```

### Frontend Components

#### New Pages

| Page | Route | Description |
|------|-------|-------------|
| `ApiKeySettingsPage` | `/settings/api-keys` | API key management interface |

#### New Components

| Component | Location | Description |
|-----------|----------|-------------|
| `ApiKeyList` | `components/settings/ApiKeyList.tsx` | List of API keys with revoke buttons |
| `ApiKeyCreateForm` | `components/settings/ApiKeyCreateForm.tsx` | Form to create new API key |
| `ApiKeyDisplay` | `components/settings/ApiKeyDisplay.tsx` | One-time display of generated key |

#### Router Changes

```tsx
{
  path: 'settings/api-keys',
  element: <RequireAuth><ApiKeySettingsPage /></RequireAuth>,
},
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/api-keys` | Required (JWT) | Create a new API key |
| `GET` | `/api/v1/api-keys` | Required (JWT) | List user's API keys |
| `DELETE` | `/api/v1/api-keys/:id` | Required (JWT) | Revoke an API key |

All existing endpoints also accept `X-API-Key` header via `apiKeyMiddleware`.

## Acceptance Criteria

- [ ] User can create an API key with a name and scopes
- [ ] Raw API key is displayed once on creation
- [ ] User can list their API keys (showing name, prefix, scopes, lastUsedAt)
- [ ] User can revoke an API key
- [ ] API key authentication works via X-API-Key header
- [ ] Per-key rate limiting is enforced
- [ ] Expired API keys are rejected
- [ ] Rate limit headers are included in responses
- [ ] OpenAPI docs at /api/v1/docs include API key auth
- [ ] Type-check passes (`make check`)
- [ ] Lint passes (`make lint`)
- [ ] Tests pass (`make test`)

## Implementation Steps

1. Add Drizzle schema changes (`apiKeys` table, relations) to `packages/db/src/schema.ts`
2. Run `make db-generate` to create migration
3. Run `make db-migrate` to apply migration
4. Create `apps/api/src/modules/api-key/utils.ts` — key generation and hashing
5. Create `apps/api/src/middleware/apiKey.ts` — API key auth + rate limiting
6. Create `apps/api/src/modules/api-key/model.ts`
7. Create `apps/api/src/modules/api-key/service.ts`
8. Create `apps/api/src/modules/api-key/index.ts`
9. Register route in `apps/api/src/routes/index.ts`
10. Add `ApiKeyCreateSchema` to shared schemas
11. Create `apps/web/src/pages/settings/ApiKeySettingsPage.tsx`
12. Create frontend components for API key management
13. Add route to `apps/web/src/router.tsx`
14. Enhance OpenAPI docs with API key authentication
15. Write tests for model, service, middleware, and API endpoints
16. Run `make check && make lint && make test`

## Dependencies

- Existing `users` table (for foreign key)
- Existing `authMiddleware`
- Existing `CacheProvider` for rate limiting
- Existing response helpers
- Existing OpenAPI/Swagger setup
