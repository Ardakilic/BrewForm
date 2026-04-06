/**
 * BrewForm API Server
 * Main entry point for the Hono backend
 */

import process from "node:process";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { compress } from "hono/compress";

import { getConfig } from "./config/index.ts";
import { getLogger } from "./utils/logger/index.ts";
import { disconnectDb, getPrisma } from "./utils/database/index.ts";
import { errorHandler } from "./middleware/errorHandler.ts";
import { requestIdMiddleware } from "./middleware/requestId.ts";
import { loggerMiddleware } from "./middleware/logger.ts";
import { apiRateLimiter } from "./middleware/rateLimit.ts";

// Import routes
import authRoutes from "./modules/auth/index.ts";
import userRoutes from "./modules/user/index.ts";
import recipeRoutes from "./modules/recipe/index.ts";
import socialRoutes from "./modules/social/index.ts";
import healthRoutes from "./modules/health/index.ts";
import tasteNotesRoutes from "./modules/taste-notes/index.ts";
import notificationRoutes from "./modules/notification/index.ts";

// ============================================
// Application Setup
// ============================================

const app: Hono = new Hono();
const config = getConfig();
const logger = getLogger();

// ============================================
// Global Middleware
// ============================================

// Security headers
app.use("*", secureHeaders());

// CORS
app.use(
  "*",
  cors({
    origin: [config.appUrl],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
    exposeHeaders: [
      "X-Request-ID",
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "X-RateLimit-Reset",
    ],
    credentials: true,
    maxAge: 86400,
  }),
);

// Compression
app.use("*", compress());

// Request ID
app.use("*", requestIdMiddleware);

// Request logging
app.use("*", loggerMiddleware);

// ============================================
// Health Routes (no rate limiting)
// ============================================

app.route("/health", healthRoutes);

// ============================================
// API Routes
// ============================================

const api = new Hono();

// Apply rate limiting to API routes
api.use("*", apiRateLimiter);

// Mount API routes
api.route("/auth", authRoutes);
api.route("/users", userRoutes);
api.route("/recipes", recipeRoutes);
api.route("/social", socialRoutes);
api.route("/taste-notes", tasteNotesRoutes);
api.route("/notifications", notificationRoutes);

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
        code: "NOT_FOUND",
        message: "The requested resource was not found",
      },
    },
    404,
  );
});

// ============================================
// Server Startup
// ============================================

async function startServer() {
  try {
    // Initialize database connection
    getPrisma();
    logger.info("Database connection initialized");

    // Start HTTP server
    const server = Deno.serve({
      port: config.port,
      handler: app.fetch,
      onListen: ({ port }) => {
        logger.info({
          type: "server",
          message: "Server started",
          port,
          env: config.nodeEnv,
          version: config.apiVersion,
        });
      },
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info({
        type: "server",
        message: `Received ${signal}, shutting down...`,
      });

      // Close HTTP server
      await server.shutdown();
      logger.info("HTTP server closed");

      // Close database connection
      await disconnectDb();

      logger.info("Graceful shutdown complete");
      Deno.exit(0);
    };

    Deno.addSignalListener("SIGTERM", () => {
      shutdown("SIGTERM");
    });
    Deno.addSignalListener("SIGINT", () => {
      shutdown("SIGINT");
    });

    // Keep the server running by awaiting the server promise
    await server;
  } catch (error) {
    logger.error({
      type: "server",
      message: "Failed to start server",
      error: error instanceof Error ? error.message : "Unknown error",
    });
    process.exit(1);
  }
}

// Start the server
startServer();

export default app;
