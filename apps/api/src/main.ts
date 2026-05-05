/**
 * BrewForm API — Hono server entry point.
 *
 * Startup sequence:
 *   1. Initialize cache driver (Deno KV or in-memory)
 *   2. Register Deno.cron jobs (badge evaluation, cache refresh)
 *   3. Bind HTTP server (auto-detect Deno Deploy for port)
 *   4. Register SIGTERM/SIGINT handlers for graceful shutdown (local only)
 *
 * Shutdown sequence (on SIGTERM/SIGINT):
 *   1. Deno.cron jobs terminate with process
 *   2. Shut down HTTP server
 *   3. Close Deno KV connection
 *   4. Disconnect Prisma client
 *   5. Exit cleanly
 *
 * Middleware stack (applied in order):
 *   cors → requestId → rateLimit(100/min) → cache injection → routes
 */
import { Hono } from 'hono';
import * as path from 'jsr:@std/path';
import { config } from './config/index.ts';
import { corsMiddleware } from './middleware/cors.ts';
import { requestIdMiddleware } from './middleware/requestId.ts';
import { errorHandler } from './middleware/errorHandler.ts';
import { rateLimitMiddleware } from './middleware/rateLimit.ts';
import { createCacheProvider } from './utils/cache/index.ts';
import type { CacheProvider } from './utils/cache/index.ts';
import { cacheProvider, setCacheProvider } from './utils/cache/singleton.ts';
import routes from './routes/index.ts';
import { createLogger } from './utils/logger/index.ts';
import { registerJob, startCronJobs } from './utils/jobs/index.ts';

const logger = createLogger('main');

type Variables = {
  requestId: string;
  cache: CacheProvider;
  userId: string | null;
  user: unknown | null;
};

const app = new Hono<{ Variables: Variables }>();

app.use('*', corsMiddleware);
app.use('*', requestIdMiddleware);
app.use('*', rateLimitMiddleware({ windowMs: 60_000, maxRequests: 100 }));
app.use('*', async (c, next) => {
  c.set('cache', cacheProvider);
  await next();
});
app.onError(errorHandler);

// Serve uploads locally when using filesystem storage
if (config.STORAGE_DRIVER === 'local') {
  app.get('/uploads/*', async (c) => {
    const userPath = c.req.param('*');
    if (!userPath) {
      return c.text('Bad Request', 400);
    }
    const resolvedUploadDir = path.resolve(config.UPLOAD_DIR);
    const filepath = path.resolve(path.join(resolvedUploadDir, userPath));

    if (
      path.isAbsolute(userPath) ||
      userPath.includes('..') ||
      !filepath.startsWith(resolvedUploadDir + path.SEPARATOR)
    ) {
      return c.text('Forbidden', 403);
    }

    try {
      const file = await Deno.open(filepath, { read: true });
      const stat = await file.stat();
      const ext = filepath.split('.').pop() || '';
      const contentType = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
      }[ext.toLowerCase()] || 'application/octet-stream';
      return new Response(file.readable, {
        headers: {
          'content-type': contentType,
          'content-length': String(stat.size),
        },
      });
    } catch {
      return c.notFound();
    }
  });
}

app.route('/', routes);

let kv: Deno.Kv | null = null;

async function startup() {
  logger.info('Starting BrewForm API...');

  if (config.CACHE_DRIVER === 'deno-kv') {
    kv = await Deno.openKv();
    setCacheProvider(createCacheProvider('deno-kv', kv));
    logger.info('Deno KV cache initialized');
  } else {
    setCacheProvider(createCacheProvider('memory'));
    logger.info('In-memory cache initialized');
  }

  // Register cron jobs before starting server
  registerJob({
    name: 'evaluate-badges',
    schedule: '0 * * * *', // hourly
    handler: async () => {
      const { evaluateAllBadges } = await import('./modules/badge/service.ts');
      await evaluateAllBadges();
    },
  });

  registerJob({
    name: 'refresh-popular-cache',
    schedule: '0 */6 * * *', // every 6 hours
    handler: async () => {
      const { refreshPopularRecipes } = await import('./modules/search/service.ts');
      await refreshPopularRecipes();
    },
  });

  startCronJobs();

  const server = Deno.env.get('DENO_DEPLOY')
    ? Deno.serve(app.fetch)
    : Deno.serve({ port: config.APP_PORT }, app.fetch);

  if (!Deno.env.get('DENO_DEPLOY')) {
    logger.info(`BrewForm API running on http://localhost:${config.APP_PORT}`);
  }

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

  if (!Deno.env.get('DENO_DEPLOY')) {
    Deno.addSignalListener('SIGTERM', shutdown);
    Deno.addSignalListener('SIGINT', shutdown);
  }
}

startup().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  Deno.exit(1);
});

export { app };
