# BrewForm Phase 4 — Backend Core (Hono)

## Status: READY

## Overview

Build the backend core infrastructure: Zod-validated env config, cache provider, logger, response helpers, CORS, request ID, error handler, auth middleware, route aggregation, health endpoints, and wire everything in `main.ts` with graceful shutdown.

---

## File Inventory

### 1. `apps/api/src/config/env.ts`

Zod-validated environment configuration:

```typescript
import { z } from 'zod';

const envSchema = z.object({
  APP_PORT: z.coerce.number().default(8000),
  APP_ENV: z.enum(['development', 'production', 'test']).default('development'),

  DATABASE_URL: z.string().min(1),
  DATABASE_PROVIDER: z.enum(['postgresql', 'mysql', 'sqlite']).default('postgresql'),

  CACHE_DRIVER: z.enum(['deno-kv']).default('deno-kv'),

  JWT_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:5173,http://localhost:8000'),

  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_SECURE: z.coerce.boolean().default(false),
  EMAIL_FROM: z.string().default('noreply@brewform.local'),

  OPENAPI_ENABLED: z.coerce.boolean().default(true),

  UPLOAD_DIR: z.string().default('./uploads'),
  UPLOAD_MAX_SIZE_BYTES: z.coerce.number().default(10 * 1024 * 1024),
  UPLOAD_ALLOWED_TYPES: z.string().default('image/jpeg,image/png,image/webp'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(Deno.env.toObject());
  if (!result.success) {
    console.error('Invalid environment variables:', result.error.flatten().fieldErrors);
    throw new Error('Invalid environment variables');
  }
  return result.data;
}

export const config = loadEnv();
```

### 2. `apps/api/src/config/index.ts`

```typescript
export { config } from './env.ts';
export type { Env } from './env.ts';
```

### 3. `apps/api/src/utils/logger/index.ts`

Pino structured logger with secret redaction:

```typescript
import pino from 'pino';

const logger = pino({
  level: Deno.env.get('LOG_LEVEL') || 'info',
  redact: ['*.passwordHash', '*.password', '*.token', '*.secret', '*.apiKey', '*.authorization'],
  serializers: {
    err: pino.stdSerializers.err,
  },
  transport: Deno.env.get('APP_ENV') === 'development'
    ? { target: 'pino-pretty' }
    : undefined,
});

export function createLogger(module: string) {
  return logger.child({ module });
}

export { logger };
```

### 4. `apps/api/src/utils/cache/index.ts`

CacheProvider interface + DenoKVCacheProvider:

```typescript
export interface CacheProvider {
  get<T>(key: string[]): Promise<T | null>;
  set<T>(key: string[], value: T, options?: { ttlMs?: number }): Promise<void>;
  delete(key: string[]): Promise<void>;
  deleteByPrefix(prefix: string[]): Promise<void>;
}

export class DenoKVCacheProvider implements CacheProvider {
  private kv: Deno.Kv;

  constructor(kv: Deno.Kv) {
    this.kv = kv;
  }

  async get<T>(key: string[]): Promise<T | null> {
    const result = await this.kv.get(key);
    return result.value as T | null;
  }

  async set<T>(key: string[], value: T, options?: { ttlMs?: number }): Promise<void> {
    await this.kv.set(key, value, options?.ttlMs ? { expireIn: options.ttlMs } : {});
  }

  async delete(key: string[]): Promise<void> {
    await this.kv.delete(key);
  }

  async deleteByPrefix(prefix: string[]): Promise<void> {
    const entries = this.kv.list({ prefix });
    for await (const entry of entries) {
      await this.kv.delete(entry.key);
    }
  }
}

export class InMemoryCacheProvider implements CacheProvider {
  private store = new Map<string, { value: unknown; expiresAt: number | null }>();

  async get<T>(key: string[]): Promise<T | null> {
    const k = key.join(':');
    const entry = this.store.get(k);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.store.delete(k);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string[], value: T, options?: { ttlMs?: number }): Promise<void> {
    const k = key.join(':');
    this.store.set(k, {
      value,
      expiresAt: options?.ttlMs ? Date.now() + options.ttlMs : null,
    });
  }

  async delete(key: string[]): Promise<void> {
    this.store.delete(key.join(':'));
  }

  async deleteByPrefix(prefix: string[]): Promise<void> {
    const p = prefix.join(':');
    for (const k of this.store.keys()) {
      if (k.startsWith(p)) {
        this.store.delete(k);
      }
    }
  }
}

export function createCacheProvider(driver: string, kv?: Deno.Kv): CacheProvider {
  switch (driver) {
    case 'deno-kv':
      if (!kv) throw new Error('Deno.Kv instance required for deno-kv cache driver');
      return new DenoKVCacheProvider(kv);
    case 'memory':
      return new InMemoryCacheProvider();
    default:
      throw new Error(`Unknown cache driver: ${driver}`);
  }
}
```

### 5. `apps/api/src/utils/response/index.ts`

API response envelope helpers:

```typescript
import type { Context } from 'hono';
import type { PaginationMeta } from '@brewform/shared/types';

export function success<T>(c: Context, data: T, status: number = 200, meta?: { pagination?: PaginationMeta }) {
  return c.json({
    success: true as const,
    data,
    meta: {
      requestId: c.get('requestId'),
      ...(meta?.pagination ? { pagination: meta.pagination } : {}),
    },
  }, status);
}

export function paginated<T>(c: Context, data: T[], pagination: PaginationMeta) {
  return c.json({
    success: true as const,
    data,
    meta: {
      requestId: c.get('requestId'),
      pagination,
    },
  }, 200);
}

export function error(c: Context, code: string, message: string, status: number, details?: Array<{ field: string; message: string }>) {
  return c.json({
    success: false as const,
    error: {
      code,
      message,
      details,
      requestId: c.get('requestId'),
    },
  }, status);
}

export function notFound(c: Context, resource: string = 'Resource') {
  return error(c, 'NOT_FOUND', `${resource} not found`, 404);
}

export function unauthorized(c: Context, message: string = 'Authentication required') {
  return error(c, 'UNAUTHORIZED', message, 401);
}

export function forbidden(c: Context, message: string = 'Insufficient permissions') {
  return error(c, 'FORBIDDEN', message, 403);
}

export function validationError(c: Context, details: Array<{ field: string; message: string }>) {
  return error(c, 'VALIDATION_ERROR', 'Validation failed', 400, details);
}
```

### 6. `apps/api/src/utils/qrcode/index.ts`

QR code generation for recipe sharing:

```typescript
import QRCode from 'qrcode';

export async function generateQRCodePng(url: string): Promise<Buffer> {
  return await QRCode.toBuffer(url, {
    type: 'png',
    width: 300,
    margin: 2,
  });
}

export async function generateQRCodeSvg(url: string): Promise<string> {
  return await QRCode.toString(url, {
    type: 'svg',
    width: 300,
    margin: 2,
  });
}
```

### 7. `apps/api/src/utils/upload/index.ts`

Photo upload handling:

```typescript
import { config } from '../../config/index.ts';

const ALLOWED_TYPES = config.UPLOAD_ALLOWED_TYPES.split(',');
const MAX_SIZE = config.UPLOAD_MAX_SIZE_BYTES;

export interface UploadedFile {
  filename: string;
  path: string;
  url: string;
  size: number;
  mimeType: string;
}

export function validateImageUpload(file: { type: string; size: number }): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return `Unsupported file type: ${file.type}. Allowed: ${ALLOWED_TYPES.join(', ')}`;
  }
  if (file.size > MAX_SIZE) {
    return `File too large. Maximum size: ${MAX_SIZE / (1024 * 1024)}MB`;
  }
  return null;
}

export function generateFilename(originalName: string): string {
  const ext = originalName.split('.').pop() || 'jpg';
  const uniqueId = crypto.randomUUID().slice(0, 8);
  const timestamp = Date.now();
  return `${timestamp}-${uniqueId}.${ext}`;
}

export function getPublicUrl(filename: string): string {
  return `/uploads/${filename}`;
}
```

### 8. `apps/api/src/middleware/cors.ts`

```typescript
import { cors } from 'hono/cors';
import { config } from '../config/index.ts';

export const corsMiddleware = cors({
  origin: config.CORS_ALLOWED_ORIGINS.split(','),
  allowHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
  maxAge: 600,
});
```

### 9. `apps/api/src/middleware/requestId.ts`

```typescript
import { requestId } from 'hono/request-id';

export const requestIdMiddleware = requestId({
  headerName: 'X-Request-ID',
});
```

### 10. `apps/api/src/middleware/errorHandler.ts`

Global error handler that maps errors to consistent response envelopes:

```typescript
import type { Context } from 'hono';
import { createLogger } from '../utils/logger/index.ts';
import { Prisma } from '@prisma/client';

const logger = createLogger('errorHandler');

export function errorHandler(err: Error, c: Context) {
  const requestId = c.get('requestId');

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    logger.error({ err, requestId, prismaCode: err.code }, 'Prisma error');

    if (err.code === 'P2002') {
      return c.json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'A record with this value already exists',
          requestId,
        },
      }, 409);
    }
    if (err.code === 'P2025') {
      return c.json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Record not found',
          requestId,
        },
      }, 404);
    }
  }

  if (err.name === 'ZodError') {
    const zodErr = err as any;
    const details = zodErr.errors?.map((e: any) => ({
      field: e.path.join('.'),
      message: e.message,
    })) || [];
    return c.json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details,
        requestId,
      },
    }, 400);
  }

  if (err.name === 'UnauthorizedError' || err.message?.includes('jwt')) {
    return c.json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
        requestId,
      },
    }, 401);
  }

  logger.error({ err, requestId }, 'Unhandled error');

  return c.json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: config.APP_ENV === 'production' ? 'Something went wrong' : err.message,
      requestId,
    },
  }, 500);
}

import { config } from '../config/index.ts';
```

### 11. `apps/api/src/middleware/auth.ts`

JWT verification middleware for Hono:

```typescript
import type { Context, Next } from 'hono';
import { verifyJwt, decodeJwt } from '../modules/auth/jwt.ts';
import { prisma } from '@brewform/db';
import { unauthorized } from '../utils/response/index.ts';

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return unauthorized(c, 'Missing or invalid Authorization header');
  }

  const token = authHeader.slice(7);
  try {
    const payload = await verifyJwt(token);
    if (!payload.sub) {
      return unauthorized(c, 'Invalid token payload');
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub, deletedAt: null },
    });

    if (!user) {
      return unauthorized(c, 'User not found');
    }
    if (user.isBanned) {
      return unauthorized(c, 'User account is banned');
    }

    c.set('userId', user.id);
    c.set('user', user);
    await next();
  } catch {
    return unauthorized(c, 'Invalid or expired token');
  }
}

export async function optionalAuthMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    c.set('userId', null);
    c.set('user', null);
    await next();
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = await verifyJwt(token);
    if (payload.sub) {
      const user = await prisma.user.findUnique({
        where: { id: payload.sub, deletedAt: null },
      });
      if (user && !user.isBanned) {
        c.set('userId', user.id);
        c.set('user', user);
      } else {
        c.set('userId', null);
        c.set('user', null);
      }
    }
  } catch {
    c.set('userId', null);
    c.set('user', null);
  }
  await next();
}

export async function adminMiddleware(c: Context, next: Next) {
  const user = c.get('user');
  if (!user || !user.isAdmin) {
    return unauthorized(c, 'Admin access required');
  }
  await next();
}
```

### 12. `apps/api/src/routes/health.ts`

Health and readiness endpoints:

```typescript
import { Hono } from 'hono';
import { prisma } from '@brewform/db';

const health = new Hono();

health.get('/health', (c) => c.json({ status: 'ok' }));

health.get('/ready', async (c) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return c.json({ status: 'ready', db: 'connected' });
  } catch {
    return c.json({ status: 'not_ready', db: 'disconnected' }, 503);
  }
});

export default health;
```

### 13. `apps/api/src/routes/index.ts`

Route aggregator — all module routes register here:

```typescript
import { Hono } from 'hono';
import health from './health.ts';

const routes = new Hono();

routes.route('/', health);

// Module routes will be registered here as they are built:
// routes.route('/api/v1/auth', authRoutes);
// routes.route('/api/v1/users', userRoutes);
// routes.route('/api/v1/recipes', recipeRoutes);
// routes.route('/api/v1/equipment', equipmentRoutes);
// routes.route('/api/v1/beans', beanRoutes);
// routes.route('/api/v1/vendors', vendorRoutes);
// routes.route('/api/v1/taste-notes', tasteRoutes);
// routes.route('/api/v1/photos', photoRoutes);
// routes.route('/api/v1/comments', commentRoutes);
// routes.route('/api/v1/follow', followRoutes);
// routes.route('/api/v1/badges', badgeRoutes);
// routes.route('/api/v1/setups', setupRoutes);
// routes.route('/api/v1/preferences', preferenceRoutes);
// routes.route('/api/v1/search', searchRoutes);
// routes.route('/api/v1/qrcode', qrcodeRoutes);
// routes.route('/api/v1/admin', adminRoutes);

export default routes;
```

### 14. `apps/api/src/main.ts` — UPDATE

Wire everything together with graceful shutdown:

```typescript
import { Hono } from 'hono';
import { config } from './config/index.ts';
import { corsMiddleware } from './middleware/cors.ts';
import { requestIdMiddleware } from './middleware/requestId.ts';
import { errorHandler } from './middleware/errorHandler.ts';
import { createCacheProvider } from './utils/cache/index.ts';
import routes from './routes/index.ts';
import { createLogger } from './utils/logger/index.ts';

const logger = createLogger('main');

const app = new Hono();

app.use('*', corsMiddleware);
app.use('*', requestIdMiddleware);
app.onError(errorHandler);

app.route('/', routes);

let kv: Deno.Kv | null = null;
let cacheProvider: ReturnType<typeof createCacheProvider> | null = null;

async function startup() {
  logger.info('Starting BrewForm API...');

  if (config.CACHE_DRIVER === 'deno-kv') {
    kv = await Deno.openKv();
    cacheProvider = createCacheProvider('deno-kv', kv);
    logger.info('Deno KV cache initialized');
  }

  const port = config.APP_PORT;
  const server = Deno.serve({ port }, app.fetch);

  logger.info(`BrewForm API running on http://localhost:${port}`);

  const shutdown = async () => {
    logger.info('Shutting down gracefully...');
    await server.shutdown();

    if (kv) {
      kv.close();
      logger.info('Deno KV connection closed');
    }

    const { prisma } = await import('@brewform/db');
    await prisma.$disconnect();
    logger.info('Database connection closed');

    logger.info('Graceful shutdown complete');
    Deno.exit(0);
  };

  Deno.addSignalListener('SIGTERM', shutdown);
  Deno.addSignalListener('SIGINT', shutdown);
}

startup().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  Deno.exit(1);
});

export { app, cacheProvider };
```

---

## Key Design Decisions

- **Config is validated at startup** — if env vars are missing or invalid, the app fails fast with clear error messages.
- **CacheProvider is interface-driven** — all cache access goes through `CacheProvider`,never directly to `Deno.openKv()`. This follows §6.2 portability rules.
- **`InMemoryCacheProvider`** — exists for tests that need cache isolation without Deno KV.
- **Error handler maps Prisma errors** — P2002 (unique constraint) → 409, P2025 (not found) → 404.
- **Auth middleware has three modes:** `authMiddleware` (required), `optionalAuthMiddleware` (best-effort), `adminMiddleware` (requires + admin).
- **Graceful shutdown** — listens for SIGTERM/SIGINT, stops accepting requests, closes KV and Prisma connections.
- **Logger redacts secrets** — Pino's `redact` option ensures passwords, tokens, and secrets never appear in logs.