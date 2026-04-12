/**
 * Health Module Tests
 */

import { beforeEach, describe, it } from "@std/testing";
import { expect } from "@std/expect";
import { type Stub, stub } from "@std/testing/mock";
import { Hono } from "hono";
import healthModule from "./index.ts";
import databaseMock from "../../test/mocks/database.ts";
import {
  resetCacheMock,
  setCacheConnectionResult,
} from "../../test/mocks/cache.ts";
import { setConfig } from "../../test/mocks/config.ts";

interface HealthResponse {
  status: string;
  timestamp: string;
  checks?: {
    database?: boolean;
    cache?: boolean;
  };
}

describe("Health Module", () => {
  let app: Hono;
  let dbStub: Stub;

  beforeEach(() => {
    dbStub?.restore();
    resetCacheMock();
    setConfig({ cacheRequired: false });
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
    it("should return ok when database and cache are healthy", async () => {
      dbStub = stub(
        databaseMock,
        "checkDbConnection",
        () => Promise.resolve(true),
      );

      const response = await app.request("/health/ready");

      expect(response.status).toBe(200);
      const body = await response.json() as HealthResponse;
      expect(body.status).toBe("ok");
      expect(body.checks?.database).toBe(true);
      expect(body.checks?.cache).toBe(true);
    });

    it("should return degraded status when database is down", async () => {
      dbStub = stub(
        databaseMock,
        "checkDbConnection",
        () => Promise.resolve(false),
      );

      const response = await app.request("/health/ready");

      expect(response.status).toBe(503);
      const body = await response.json() as HealthResponse;
      expect(body.status).toBe("degraded");
      expect(body.checks?.database).toBe(false);
    });

    it("should remain ready when cache is down and cacheRequired=false", async () => {
      dbStub = stub(
        databaseMock,
        "checkDbConnection",
        () => Promise.resolve(true),
      );
      setCacheConnectionResult(false);
      setConfig({ cacheRequired: false });

      const response = await app.request("/health/ready");

      expect(response.status).toBe(200);
      const body = await response.json() as HealthResponse;
      expect(body.status).toBe("ok");
      expect(body.checks?.database).toBe(true);
      expect(body.checks?.cache).toBe(false);
    });

    it("should return degraded when cache is down and cacheRequired=true", async () => {
      dbStub = stub(
        databaseMock,
        "checkDbConnection",
        () => Promise.resolve(true),
      );
      setCacheConnectionResult(false);
      setConfig({ cacheRequired: true });

      const response = await app.request("/health/ready");

      expect(response.status).toBe(503);
      const body = await response.json() as HealthResponse;
      expect(body.status).toBe("degraded");
      expect(body.checks?.cache).toBe(false);
    });

    it("should handle database check errors gracefully", async () => {
      dbStub = stub(
        databaseMock,
        "checkDbConnection",
        () => Promise.reject(new Error("Connection timeout")),
      );

      const response = await app.request("/health/ready");

      expect(response.status).toBe(503);
      const body = await response.json() as HealthResponse;
      expect(body.status).toBe("degraded");
      expect(body.checks?.database).toBe(false);
    });
  });

  describe("GET /health/startup", () => {
    it("should return ok when application has started successfully", async () => {
      dbStub = stub(
        databaseMock,
        "checkDbConnection",
        () => Promise.resolve(true),
      );

      const response = await app.request("/health/startup");

      expect(response.status).toBe(200);
      const body = await response.json() as HealthResponse;
      expect(body.status).toBe("ok");
    });

    it("should return starting status when database is not ready", async () => {
      dbStub = stub(
        databaseMock,
        "checkDbConnection",
        () => Promise.resolve(false),
      );

      const response = await app.request("/health/startup");

      expect(response.status).toBe(503);
      const body = await response.json() as HealthResponse;
      expect(body.status).toBe("starting");
    });

    it("should return ok when cache down but cacheRequired=false", async () => {
      dbStub = stub(
        databaseMock,
        "checkDbConnection",
        () => Promise.resolve(true),
      );
      setCacheConnectionResult(false);
      setConfig({ cacheRequired: false });

      const response = await app.request("/health/startup");

      expect(response.status).toBe(200);
      const body = await response.json() as HealthResponse;
      expect(body.status).toBe("ok");
    });
  });
});
