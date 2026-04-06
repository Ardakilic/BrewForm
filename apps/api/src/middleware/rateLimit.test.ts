/**
 * Rate Limit Middleware Tests
 */

import { afterEach, describe, it } from "@std/testing";
import { expect } from "@std/expect";
import { Hono } from "hono";
import {
  apiRateLimiter,
  authRateLimiter,
  createRateLimiter,
  rateLimitMiddleware,
  writeRateLimiter,
} from "./_impl/rateLimit.ts";
import {
  getCheckRateLimitCalls,
  resetCheckRateLimitCalls,
} from "../test/mocks/rate-limit-util.ts";

describe("Rate Limit Middleware", () => {
  afterEach(() => {
    resetCheckRateLimitCalls();
  });

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
      expect(response.headers.get("X-RateLimit-Remaining")).toBe("99");
      expect(response.headers.get("X-RateLimit-Reset")).toBeDefined();
    });

    it("should allow authenticated user requests and use user ID as identifier", async () => {
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
      const calls = getCheckRateLimitCalls();
      expect(calls.length).toBe(1);
      expect(calls[0].identifier).toBe("user:user_123");
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
      const calls = getCheckRateLimitCalls();
      expect(calls.length).toBe(1);
      expect(calls[0].identifier).toBe("ip:192.168.1.100");
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
      const calls = getCheckRateLimitCalls();
      expect(calls.length).toBe(1);
      expect(calls[0].identifier).toBe("ip:192.168.1.200");
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
      // skipIfAuthenticated must prevent checkRateLimit from being called
      const calls = getCheckRateLimitCalls();
      expect(calls.length).toBe(0);
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
      const calls = getCheckRateLimitCalls();
      expect(calls.length).toBe(1);
      expect(calls[0].action).toBe("custom");
      expect(calls[0].maxRequests).toBe(5);
      expect(calls[0].windowMs).toBe(30000);
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
