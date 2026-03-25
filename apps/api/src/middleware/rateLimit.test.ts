/**
 * Rate Limit Middleware Tests
 */

import { beforeEach, describe, it } from "@std/testing";
import { expect } from "@std/expect";
import { type Stub, stub } from "@std/testing/mock";
import { Hono } from "hono";
import {
  apiRateLimiter,
  authRateLimiter,
  createRateLimiter,
  rateLimitMiddleware,
  writeRateLimiter,
} from "./_impl/rateLimit.ts";
import redisMock from "../test/mocks/redis.ts";

describe("Rate Limit Middleware", () => {
  let checkRateLimitStub: Stub;
  let callCountBefore = 0;

  beforeEach(() => {
    checkRateLimitStub?.restore();
    checkRateLimitStub = stub(
      redisMock,
      "checkRateLimit",
      () =>
        Promise.resolve({
          allowed: true,
          remaining: 99,
          resetAt: Date.now() + 60000,
        }),
    );
    callCountBefore = checkRateLimitStub.calls.length;
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

    it("should call checkRateLimit with authenticated user ID", async () => {
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

      await app.request("/test");

      const newCalls = checkRateLimitStub.calls.slice(callCountBefore);
      expect(newCalls.length).toBeGreaterThan(0);
      expect(newCalls[0].args[0]).toBe("user:user_123");
    });

    it("should use IP from X-Forwarded-For header for unauthenticated requests", async () => {
      const limiter = createRateLimiter();
      const app = new Hono();
      app.use("*", async (c, next) => {
        c.set("user", null);
        await next();
      });
      app.use("*", limiter);
      app.get("/test", (c) => c.json({ success: true }));

      await app.request("/test", {
        headers: { "X-Forwarded-For": "192.168.1.100, 10.0.0.1" },
      });

      const newCalls = checkRateLimitStub.calls.slice(callCountBefore);
      expect(newCalls.length).toBeGreaterThan(0);
      expect(newCalls[0].args[0]).toBe(
        "ip:192.168.1.100",
      );
    });

    it("should use IP from X-Real-IP header as fallback", async () => {
      const limiter = createRateLimiter();
      const app = new Hono();
      app.use("*", async (c, next) => {
        c.set("user", null);
        await next();
      });
      app.use("*", limiter);
      app.get("/test", (c) => c.json({ success: true }));

      await app.request("/test", {
        headers: {
          "X-Real-IP": "192.168.1.200",
        },
      });

      const testCalls = checkRateLimitStub.calls.slice(callCountBefore);
      expect(testCalls.length).toBeGreaterThan(0);
      expect(testCalls[0].args[0]).toBe("ip:192.168.1.200");
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

      const newCalls = checkRateLimitStub.calls.slice(callCountBefore);
      expect(newCalls.length).toBe(0);
      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
    });

    it("should use custom options when provided", async () => {
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

      await app.request("/test");

      const newCalls = checkRateLimitStub.calls.slice(callCountBefore);
      expect(newCalls.length).toBeGreaterThan(0);
      expect(newCalls[0].args[1]).toBe("custom");
      expect(newCalls[0].args[2]).toBe(5);
      expect(newCalls[0].args[3]).toBe(30000);
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
