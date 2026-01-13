/**
 * BrewForm API Server
 * Main entry point for the Hono backend
 */

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { compress } from 'hono/compress';

import { getConfig } from './config/index.js';
import { getLogger } from './utils/logger/index.js';
import { getPrisma, disconnectDb } from './utils/database/index.js';
import { getRedis, disconnectRedis } from './utils/redis/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { loggerMiddleware } from './middleware/logger.js';
import { apiRateLimiter } from './middleware/rateLimit.js';

// Import routes
import authRoutes from './modules/auth/index.js';
import userRoutes from './modules/user/index.js';
import recipeRoutes from './modules/recipe/index.js';
import socialRoutes from './modules/social/index.js';
import healthRoutes from './modules/health/index.js';
import tasteNotesRoutes from './modules/taste-notes/index.js';
import notificationRoutes from './modules/notification/index.js';

// ============================================
// Application Setup
// ============================================

const app = new Hono();
const config = getConfig();
const logger = getLogger();

// ============================================
// Global Middleware
// ============================================

// Security headers
app.use('*', secureHeaders());

// CORS
app.use(
  '*',
  cors({
    origin: [config.appUrl],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposeHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    credentials: true,
    maxAge: 86400,
  })
);

// Compression
app.use('*', compress());

// Request ID
app.use('*', requestIdMiddleware);

// Request logging
app.use('*', loggerMiddleware);

// ============================================
// Health Routes (no rate limiting)
// ============================================

app.route('/health', healthRoutes);

// ============================================
// API Routes
// ============================================

const api = new Hono();

// Apply rate limiting to API routes
api.use('*', apiRateLimiter);

// Mount API routes
api.route('/auth', authRoutes);
api.route('/users', userRoutes);
api.route('/recipes', recipeRoutes);
api.route('/social', socialRoutes);
api.route('/taste-notes', tasteNotesRoutes);
api.route('/notifications', notificationRoutes);

// API version prefix
app.route(`/api/${config.apiVersion}`, api);

// ============================================
// Error Handling
// ============================================

app.onError(errorHandler);

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'The requested resource was not found',
      },
    },
    404
  );
});

// ============================================
// Server Startup
// ============================================

async function startServer() {
  try {
    // Initialize database connection
    getPrisma();
    logger.info('Database connection initialized');

    // Initialize Redis connection
    await getRedis().connect();
    logger.info('Redis connection initialized');

    // Start HTTP server
    const server = serve({
      fetch: app.fetch,
      port: config.port,
    });

    logger.info({
      type: 'server',
      message: 'Server started',
      port: config.port,
      env: config.nodeEnv,
      version: config.apiVersion,
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info({ type: 'server', message: `Received ${signal}, shutting down...` });

      // Close HTTP server
      server.close(() => {
        logger.info('HTTP server closed');
      });

      // Close database connection
      await disconnectDb();

      // Close Redis connection
      await disconnectRedis();

      logger.info('Graceful shutdown complete');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error({
      type: 'server',
      message: 'Failed to start server',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    process.exit(1);
  }
}

// Start the server
startServer();

export default app;
