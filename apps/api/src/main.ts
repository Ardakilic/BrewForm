/**
 * BrewForm API — Hono server entry point.
 *
 * Startup sequence:
 *   1. Initialize cache driver (memory | redis, or disabled via CACHE_ENABLED)
 *   2. Install the rate-limit backend (RATE_LIMIT_STORE: memory | redis, on its
 *      own Redis connection; independent of the cache) and log its settings
 *   3. Register node-cron jobs (hourly badge evaluation)
 *   4. Verify storage (`verifyStorage`): for the local driver create UPLOAD_DIR
 *      and prove it is writable; on failure log one error (directory, UID/GID,
 *      ownership fix) and exit with status 1 before listening
 *   5. Bind HTTP server via @hono/node-server
 *   6. Register SIGTERM/SIGINT handlers for graceful shutdown
 *
 * Shutdown sequence (on SIGTERM/SIGINT):
 *   1. Shut down HTTP server
 *   2. Close postgres-js client
 *   3. Close email transporter, cache connection and rate-limit store connection
 *   4. Exit cleanly
 *
 * Middleware stack (applied in order):
 *   cors → requestId → secureHeaders → rateLimit(POLICIES.global: RATE_LIMIT_GLOBAL_MAX/min per
 *   client IP, skipping /health, /ready and GET /uploads/*) → bodyLimit(1MB, excl. /api/v1/photos)
 *   → cache injection → crawler → routes (GET /uploads/* has its own POLICIES.uploads limit)
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { serve } from '@hono/node-server';
import { type Context, Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { config } from './config/index.ts';
import { bodyLimitMiddleware } from './middleware/bodyLimit.ts';
import { corsMiddleware } from './middleware/cors.ts';
import { crawlerMiddleware } from './middleware/crawler.ts';
import { errorHandler } from './middleware/errorHandler.ts';
import { rateLimit } from './middleware/rateLimit.ts';
import { requestIdMiddleware } from './middleware/requestId.ts';
import routes from './routes/index.ts';
import type { AppEnv } from './types/hono.ts';
import { createCacheProvider, NullCacheProvider } from './utils/cache/index.ts';
import { cacheProvider, setCacheProvider } from './utils/cache/singleton.ts';
import { createLogger } from './utils/logger/index.ts';
import { createRedisBackend } from './utils/rate-limit/backend.ts';
import { POLICIES } from './utils/rate-limit/policies.ts';
import { getRateLimitBackend, setRateLimitBackend } from './utils/rate-limit/registry.ts';
import { createRedisClient } from './utils/redis/client.ts';
import { StorageStartupError, verifyStorage } from './utils/storage/index.ts';
import './utils/jobs/cron.ts';

const logger = createLogger('main');

/**
 * Requests the global limiter never counts: the health probes and local
 * upload reads (which have their own `uploads` policy).
 *
 * @param c - The request context.
 * @returns `true` for `/health`, `/ready` and `GET`/`HEAD` `/uploads/*`.
 */
export function skipGlobalRateLimit(c: Context): boolean {
  const path = c.req.path;
  if (path === '/health' || path === '/ready') return true;
  return (c.req.method === 'GET' || c.req.method === 'HEAD') && path.startsWith('/uploads/');
}

/**
 * Root Hono application. Applies the middleware stack and mounts {@link routes};
 * exported below for tests and the request handler.
 */
const app = new Hono<AppEnv>();

app.use('*', corsMiddleware);
app.use('*', requestIdMiddleware);
app.use(
  '*',
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
    strictTransportSecurity: 'max-age=63072000; includeSubDomains; preload',
    xContentTypeOptions: 'nosniff',
    xFrameOptions: 'DENY',
    referrerPolicy: 'strict-origin-when-cross-origin',
    permissionsPolicy: {
      camera: [],
      microphone: [],
      geolocation: [],
    },
  }),
);
app.use('*', rateLimit(POLICIES.global, { skip: skipGlobalRateLimit }));
app.use('*', bodyLimitMiddleware);
app.use('*', async (c, next) => {
  c.set('cache', cacheProvider);
  await next();
});
app.use('*', crawlerMiddleware);
app.onError(errorHandler);

// Serve uploads locally when using filesystem storage. The path is captured by
// a named regex param: Hono's bare `*` wildcard is not readable through
// `c.req.param('*')` (it always returned undefined, so every request got 400).
if (config.STORAGE_DRIVER === 'local') {
  app.get('/uploads/:path{.+}', rateLimit(POLICIES.uploads), async (c) => {
    const userPath = c.req.param('path');
    if (!userPath) {
      return c.text('Bad Request', 400);
    }
    // config.UPLOAD_DIR is already absolute (resolved once in config/env.ts),
    // so the driver and this handler always use the same directory.
    const uploadDir = config.UPLOAD_DIR;
    const filepath = path.resolve(uploadDir, userPath);

    if (
      path.isAbsolute(userPath) ||
      userPath.includes('..') ||
      !filepath.startsWith(uploadDir + path.sep)
    ) {
      return c.text('Forbidden', 403);
    }

    let data: Buffer;
    try {
      data = await readFile(filepath);
      const ext = filepath.split('.').pop() ?? '';
      const contentTypes: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
      };
      const contentType = contentTypes[ext.toLowerCase()] ?? 'application/octet-stream';
      // Copy out of the (possibly pooled) Buffer so the body is exactly this file.
      const body = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      return new Response(body as ArrayBuffer, {
        headers: {
          'content-type': contentType,
          'content-length': String(data.byteLength),
        },
      });
    } catch {
      return c.notFound();
    }
  });
}

app.route('/', routes);

/**
 * Boot the API: initialize the cache, verify storage (exits with status 1 on a
 * `StorageStartupError`), bind the HTTP server and register the graceful
 * shutdown handlers. See the startup sequence in the module docblock.
 */
async function startup() {
  logger.info('Starting BrewForm API...');

  if (config.CACHE_ENABLED) {
    setCacheProvider(createCacheProvider(config.CACHE_DRIVER, { redisUrl: config.REDIS_URL }));
  } else {
    setCacheProvider(new NullCacheProvider());
  }
  logger.info({ enabled: config.CACHE_ENABLED, driver: config.CACHE_DRIVER }, 'Cache initialized');

  // The limiter has its own connection and never goes through the cache.
  if (config.RATE_LIMIT_STORE === 'redis') {
    setRateLimitBackend(
      createRedisBackend(
        createRedisClient(config.REDIS_URL as string, { connectionName: 'brewform-rate-limit' }),
      ),
    );
  }
  logger.info(
    {
      enabled: config.RATE_LIMIT_ENABLED,
      store: config.RATE_LIMIT_STORE,
      trustProxy: config.TRUST_PROXY,
      hops: config.TRUST_PROXY_HOPS,
    },
    'Rate limiting initialized',
  );
  if (!config.RATE_LIMIT_ENABLED) {
    logger.warn({}, 'Rate limiting is disabled (RATE_LIMIT_ENABLED=false)');
  }

  // Cron jobs are registered at module top-level via import above

  try {
    await verifyStorage(config);
  } catch (err) {
    if (err instanceof StorageStartupError) {
      logger.error(
        {
          err,
          uploadDir: config.UPLOAD_DIR,
          uid: process.getuid?.(),
          gid: process.getgid?.(),
        },
        err.message,
      );
      process.exit(1);
    }
    throw err;
  }

  const server = serve({ fetch: app.fetch, port: config.APP_PORT });
  logger.info(`BrewForm API running on http://localhost:${config.APP_PORT}`);

  const shutdown = async () => {
    logger.info('Shutting down gracefully...');

    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });

    const { client } = await import('@brewform/db');
    await client.end();
    logger.info('Database connection closed');

    const { closeTransporter } = await import('./utils/notify/index.ts');
    closeTransporter();
    logger.info('Email transporter closed');

    await cacheProvider.close?.();
    logger.info('Cache connection closed');

    await getRateLimitBackend().close();
    logger.info('Rate-limit store closed');

    logger.info('Graceful shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

if (import.meta.main) {
  startup().catch((err) => {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  });
}

export { app };
