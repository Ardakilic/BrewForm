/**
 * BrewForm Health Check Routes
 * Kubernetes-ready health and readiness probes
 */

import { Hono } from "hono";
import { checkDbConnection } from "../../utils/database/index.ts";
import { getLogger } from "../../utils/logger/index.ts";
import { checkCacheConnection } from "../../utils/cache/index.ts";
import { getConfig } from "../../config/index.ts";

const health = new Hono();

/**
 * GET /health
 * Basic health check - is the server running?
 */
health.get(
  "/", // deno-lint-ignore require-await
  async (c) => {
    return c.json({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  },
);

/**
 * GET /health/live
 * Liveness probe - is the application alive?
 */
health.get(
  "/live", // deno-lint-ignore require-await
  async (c) => {
    return c.json({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  },
);

/**
 * GET /health/ready
 * Readiness probe - is the application ready to accept traffic?
 */
health.get("/ready", async (c) => {
  const logger = getLogger();
  const config = getConfig();
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
      type: "health",
      check: "database",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }

  // Check cache
  try {
    checks.cache = await checkCacheConnection();
    if (!checks.cache && config.cacheRequired) isReady = false;
  } catch (error) {
    checks.cache = false;
    if (config.cacheRequired) isReady = false;
    logger.error({
      type: "health",
      check: "cache",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }

  const status = isReady ? "ok" : "degraded";
  const statusCode = isReady ? 200 : 503;

  return c.json(
    {
      status,
      timestamp: new Date().toISOString(),
      checks,
    },
    statusCode as 200 | 503,
  );
});

/**
 * GET /health/startup
 * Startup probe - has the application finished starting?
 */
health.get("/startup", async (c) => {
  const config = getConfig();
  const logger = getLogger();
  let dbOk = false;
  let cacheOk = false;

  try {
    dbOk = await checkDbConnection();
  } catch (error) {
    logger.error({
      type: "health",
      check: "database",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }

  if (config.cacheRequired) {
    try {
      cacheOk = await checkCacheConnection();
    } catch (error) {
      logger.error({
        type: "health",
        check: "cache",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  } else {
    cacheOk = true;
  }

  const isStarted = dbOk && (cacheOk || !config.cacheRequired);

  return c.json(
    {
      status: isStarted ? "ok" : "starting",
      timestamp: new Date().toISOString(),
    },
    isStarted ? 200 : 503,
  );
});

export default health;
