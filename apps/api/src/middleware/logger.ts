/**
 * BrewForm Request Logging Middleware
 * Logs all HTTP requests with structured data
 */

import { createMiddleware } from 'hono/factory';
import { getLogger } from '../utils/logger/index.js';

/**
 * Request logging middleware
 */
export const loggerMiddleware = createMiddleware(async (c, next) => {
  const logger = getLogger();
  const start = Date.now();
  const requestId = c.get('requestId') || 'unknown';
  const method = c.req.method;
  const path = c.req.path;

  // Log request start
  logger.debug({
    type: 'http',
    phase: 'request',
    requestId,
    method,
    path,
    userAgent: c.req.header('user-agent'),
  });

  try {
    await next();
  } finally {
    const duration = Date.now() - start;
    const status = c.res.status;
    const user = c.get('user');

    // Log request completion
    const logLevel = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
    
    logger[logLevel]({
      type: 'http',
      phase: 'response',
      requestId,
      method,
      path,
      status,
      duration,
      userId: user?.id,
    });
  }
});

export default loggerMiddleware;
