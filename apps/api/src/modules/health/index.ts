/**
 * BrewForm Health Check Routes
 * Kubernetes-ready health and readiness probes
 */

import { Hono } from 'hono';
import { checkDbConnection } from '../../utils/database/index.js';
import { checkRedisConnection } from '../../utils/redis/index.js';
import { getLogger } from '../../utils/logger/index.js';

const health = new Hono();

/**
 * GET /health
 * Basic health check - is the server running?
 */
health.get('/', async (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/live
 * Liveness probe - is the application alive?
 */
health.get('/live', async (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/ready
 * Readiness probe - is the application ready to accept traffic?
 */
health.get('/ready', async (c) => {
  const logger = getLogger();
  const checks: Record<string, boolean> = {};
  let isReady = true;

  // Check database
  try {
    checks.database = await checkDbConnection();
    if (!checks.database) isReady = false;
  } catch (error) {
    checks.database = false;
    isReady = false;
    logger.error({
      type: 'health',
      check: 'database',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // Check Redis
  try {
    checks.redis = await checkRedisConnection();
    if (!checks.redis) isReady = false;
  } catch (error) {
    checks.redis = false;
    isReady = false;
    logger.error({
      type: 'health',
      check: 'redis',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  const status = isReady ? 'ok' : 'degraded';
  const statusCode = isReady ? 200 : 503;

  return c.json(
    {
      status,
      timestamp: new Date().toISOString(),
      checks,
    },
    statusCode as 200 | 503
  );
});

/**
 * GET /health/startup
 * Startup probe - has the application finished starting?
 */
health.get('/startup', async (c) => {
  // Same as ready for now
  const dbOk = await checkDbConnection();
  const redisOk = await checkRedisConnection();
  const isStarted = dbOk && redisOk;

  return c.json(
    {
      status: isStarted ? 'ok' : 'starting',
      timestamp: new Date().toISOString(),
    },
    isStarted ? 200 : 503
  );
});

export default health;
