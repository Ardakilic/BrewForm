import { Hono } from 'hono';
import { config } from './config/index.ts';
import { corsMiddleware } from './middleware/cors.ts';
import { requestIdMiddleware } from './middleware/requestId.ts';
import { errorHandler } from './middleware/errorHandler.ts';
import { rateLimitMiddleware } from './middleware/rateLimit.ts';
import { createCacheProvider } from './utils/cache/index.ts';
import type { CacheProvider } from './utils/cache/index.ts';
import routes from './routes/index.ts';
import { createLogger } from './utils/logger/index.ts';
import { startJobs, stopJobs } from './utils/jobs/index.ts';

const logger = createLogger('main');

type Variables = {
  requestId: string;
  cache: CacheProvider;
  userId: string | null;
  user: unknown | null;
};

const app = new Hono<{ Variables: Variables }>();

let cacheProvider: CacheProvider = createCacheProvider('memory');

app.use('*', corsMiddleware);
app.use('*', requestIdMiddleware);
app.use('*', rateLimitMiddleware({ windowMs: 60_000, maxRequests: 100 }));
app.use('*', async (c, next) => {
  c.set('cache', cacheProvider);
  await next();
});
app.onError(errorHandler);

app.route('/', routes);

let kv: Deno.Kv | null = null;

async function startup() {
  logger.info('Starting BrewForm API...');

  if (config.CACHE_DRIVER === 'deno-kv') {
    kv = await Deno.openKv();
    cacheProvider = createCacheProvider('deno-kv', kv);
    logger.info('Deno KV cache initialized');
  } else {
    cacheProvider = createCacheProvider('memory');
    logger.info('In-memory cache initialized');
  }

  startJobs();

  const port = config.APP_PORT;
  const server = Deno.serve({ port }, app.fetch);

  logger.info(`BrewForm API running on http://localhost:${port}`);

  const shutdown = async () => {
    logger.info('Shutting down gracefully...');
    stopJobs();

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