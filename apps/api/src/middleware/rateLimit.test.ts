/**
 * Rate Limit Middleware Tests
 */

import { describe, it } from "@std/testing";
import { expect } from "@std/expect";
import { Hono } from "hono";
import {
  apiRateLimiter,
  authRateLimiter,
  createRateLimiter,
  rateLimitMiddleware,
  writeRateLimiter,
} from "./_impl/rateLimit.ts";

describe("Rate Limit Middleware", () => {
  describe("createRateLimiter", () => {
    it("should allow request and set rate limit headers", async () => {
      const limiter = createRateLimiter();
      const app = new Hono();
      app.use("*", limiter);
      app.get("/test", (c) => c.json({ success: true }));

      const response = await app.request("/test");
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(response.headers.get("X-RateLimit-Limit")).toBe("100");
      expect(response.headers.get("X-RateLimit-Remaining")).toBeDefined();
      expect(response.headers.get("X-RateLimit-Reset")).toBeDefined();
    });

    it("should allow authenticated user requests", async () => {
      const limiter = createRateLimiter();
      const app = new Hono();
      app.use("*", async (c, next) => {
        c.set("user", {
          id: "user_123",
          email: "test@example.com",
          username: "testuser",
          isAdmin: false,
          isBanned: false,
        });
        await next();
      });
      app.use("*", limiter);
      app.get("/test", (c) => c.json({ success: true }));

      const response = await app.request("/test");
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
    });

    it("should allow unauthenticated requests with IP from X-Forwarded-For header", async () => {
      const limiter = createRateLimiter();
      const app = new Hono();
      app.use("*", async (c, next) => {
        c.set("user", null);
        await next();
      });
      app.use("*", limiter);
      app.get("/test", (c) => c.json({ success: true }));

      const response = await app.request("/test", {
        headers: { "X-Forwarded-For": "192.168.1.100, 10.0.0.1" },
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
    });

    it("should allow unauthenticated requests with IP from X-Real-IP header", async () => {
      const limiter = createRateLimiter();
      const app = new Hono();
      app.use("*", async (c, next) => {
        c.set("user", null);
        await next();
      });
      app.use("*", limiter);
      app.get("/test", (c) => c.json({ success: true }));

      const response = await app.request("/test", {
        headers: {
          "X-Real-IP": "192.168.1.200",
        },
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
    });

    it("should skip rate limiting for authenticated users when configured", async () => {
      const limiter = createRateLimiter({ skipIfAuthenticated: true });
      const app = new Hono();
      app.use("*", async (c, next) => {
        c.set("user", {
          id: "user_123",
          email: "test@example.com",
          username: "testuser",
          isAdmin: false,
          isBanned: false,
        });
        await next();
      });
      app.use("*", limiter);
      app.get("/test", (c) => c.json({ success: true }));

      const response = await app.request("/test");
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
    });

    it("should allow custom options", async () => {
      const limiter = createRateLimiter({
        windowMs: 30000,
        maxRequests: 5,
        action: "custom",
      });
      const app = new Hono();
      app.use("*", async (c, next) => {
        c.set("user", null);
        await next();
      });
      app.use("*", limiter);
      app.get("/test", (c) => c.json({ success: true }));

      const response = await app.request("/test");
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(response.headers.get("X-RateLimit-Limit")).toBe("5");
    });
  });

  describe("Pre-built rate limiters", () => {
    it("should have rateLimitMiddleware instance", () => {
      expect(rateLimitMiddleware).toBeDefined();
      expect(typeof rateLimitMiddleware).toBe("function");
    });

    it("should have authRateLimiter instance", () => {
      expect(authRateLimiter).toBeDefined();
      expect(typeof authRateLimiter).toBe("function");
    });

    it("should have apiRateLimiter instance", () => {
      expect(apiRateLimiter).toBeDefined();
      expect(typeof apiRateLimiter).toBe("function");
    });

    it("should have writeRateLimiter instance", () => {
      expect(writeRateLimiter).toBeDefined();
      expect(typeof writeRateLimiter).toBe("function");
    });
  });
});
