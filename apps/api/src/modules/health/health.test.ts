/**
 * Health Module Tests
 */

import { beforeEach, describe, it } from "@std/testing";
import { expect } from "@std/expect";
import { Hono } from "hono";
import healthModule from "./index.ts";
import { checkDbConnection } from "../../test/mocks/database.ts";
import { checkRedisConnection } from "../../test/mocks/redis.ts";

// API Response type for testing
interface HealthResponse {
  status: string;
  timestamp: string;
  checks?: {
    database?: boolean;
    redis?: boolean;
  };
}

describe("Health Module", () => {
  let app: Hono;

  beforeEach(() => {
    checkDbConnection.mockReset();
    checkRedisConnection.mockReset();
    app = new Hono();
    app.route("/health", healthModule);
  });

  describe("GET /health", () => {
    it("should return ok status", async () => {
      const response = await app.request("/health");

      expect(response.status).toBe(200);
      const body = await response.json() as HealthResponse;
      expect(body.status).toBe("ok");
      expect(body.timestamp).toBeDefined();
    });

    it("should include valid ISO timestamp", async () => {
      const response = await app.request("/health");
      const body = await response.json() as HealthResponse;

      // Verify timestamp is valid ISO format
      const timestamp = new Date(body.timestamp);
      expect(timestamp.toISOString()).toBe(body.timestamp);
    });
  });

  describe("GET /health/live", () => {
    it("should return ok status for liveness probe", async () => {
      const response = await app.request("/health/live");

      expect(response.status).toBe(200);
      const body = await response.json() as HealthResponse;
      expect(body.status).toBe("ok");
      expect(body.timestamp).toBeDefined();
    });
  });

  describe("GET /health/ready", () => {
    it("should return ok when all dependencies are healthy", async () => {
      checkDbConnection.mockResolvedValue(true);
      checkRedisConnection.mockResolvedValue(true);

      const response = await app.request("/health/ready");

      expect(response.status).toBe(200);
      const body = await response.json() as HealthResponse;
      expect(body.status).toBe("ok");
      expect(body.checks?.database).toBe(true);
      expect(body.checks?.redis).toBe(true);
    });

    it("should return degraded status when database is down", async () => {
      checkDbConnection.mockResolvedValue(false);
      checkRedisConnection.mockResolvedValue(true);

      const response = await app.request("/health/ready");

      expect(response.status).toBe(503);
      const body = await response.json() as HealthResponse;
      expect(body.status).toBe("degraded");
      expect(body.checks?.database).toBe(false);
      expect(body.checks?.redis).toBe(true);
    });

    it("should return degraded status when redis is down", async () => {
      checkDbConnection.mockResolvedValue(true);
      checkRedisConnection.mockResolvedValue(false);

      const response = await app.request("/health/ready");

      expect(response.status).toBe(503);
      const body = await response.json() as HealthResponse;
      expect(body.status).toBe("degraded");
      expect(body.checks?.database).toBe(true);
      expect(body.checks?.redis).toBe(false);
    });

    it("should return degraded status when all dependencies are down", async () => {
      checkDbConnection.mockResolvedValue(false);
      checkRedisConnection.mockResolvedValue(false);

      const response = await app.request("/health/ready");

      expect(response.status).toBe(503);
      const body = await response.json() as HealthResponse;
      expect(body.status).toBe("degraded");
      expect(body.checks?.database).toBe(false);
      expect(body.checks?.redis).toBe(false);
    });

    it("should handle database check errors gracefully", async () => {
      checkDbConnection.mockRejectedValue(new Error("Connection timeout"));
      checkRedisConnection.mockResolvedValue(true);

      const response = await app.request("/health/ready");

      expect(response.status).toBe(503);
      const body = await response.json() as HealthResponse;
      expect(body.status).toBe("degraded");
      expect(body.checks?.database).toBe(false);
    });

    it("should handle redis check errors gracefully", async () => {
      checkDbConnection.mockResolvedValue(true);
      checkRedisConnection.mockRejectedValue(new Error("Redis unavailable"));

      const response = await app.request("/health/ready");

      expect(response.status).toBe(503);
      const body = await response.json() as HealthResponse;
      expect(body.status).toBe("degraded");
      expect(body.checks?.redis).toBe(false);
    });
  });

  describe("GET /health/startup", () => {
    it("should return ok when application has started successfully", async () => {
      checkDbConnection.mockResolvedValue(true);
      checkRedisConnection.mockResolvedValue(true);

      const response = await app.request("/health/startup");

      expect(response.status).toBe(200);
      const body = await response.json() as HealthResponse;
      expect(body.status).toBe("ok");
    });

    it("should return starting status when database is not ready", async () => {
      checkDbConnection.mockResolvedValue(false);
      checkRedisConnection.mockResolvedValue(true);

      const response = await app.request("/health/startup");

      expect(response.status).toBe(503);
      const body = await response.json() as HealthResponse;
      expect(body.status).toBe("starting");
    });

    it("should return starting status when redis is not ready", async () => {
      checkDbConnection.mockResolvedValue(true);
      checkRedisConnection.mockResolvedValue(false);

      const response = await app.request("/health/startup");

      expect(response.status).toBe(503);
      const body = await response.json() as HealthResponse;
      expect(body.status).toBe("starting");
    });

    it("should return starting status when no dependencies are ready", async () => {
      checkDbConnection.mockResolvedValue(false);
      checkRedisConnection.mockResolvedValue(false);

      const response = await app.request("/health/startup");

      expect(response.status).toBe(503);
      const body = await response.json() as HealthResponse;
      expect(body.status).toBe("starting");
    });
  });
});
