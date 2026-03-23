/**
 * Recipe Module Tests
 */

import { beforeEach, describe, it } from "@std/testing";
import { expect } from "@std/expect";
import { Hono } from "hono";
import { mockFn } from "../../test/mock-fn.ts";
import { setPrisma } from "../../test/mocks/database.ts";
import recipeModule from "./index.ts";
import type { Context } from "hono";

// API Response type for testing
interface ApiResponse {
  success: boolean;
  data?: unknown;
  error?: { code: string; message: string };
  message?: string;
  pagination?: { page: number; limit: number; total: number; pages: number };
}

// Test error handler
const testErrorHandler = (err: Error & { statusCode?: number }, c: Context) => {
  const statusCode = err.statusCode || 500;
  const code = err.name === "NotFoundError"
    ? "NOT_FOUND"
    : err.name === "ForbiddenError"
    ? "FORBIDDEN"
    : err.name === "ValidationError"
    ? "VALIDATION_ERROR"
    : "INTERNAL_ERROR";
  return c.json(
    { success: false, error: { code, message: err.message } },
    statusCode as 400 | 403 | 404 | 422 | 500,
  );
};

const createLocalMockPrisma = () => {
  // deno-lint-ignore no-explicit-any
  const mp: any = {
    recipe: {
      findMany: mockFn(),
      findUnique: mockFn(),
      findFirst: mockFn(),
      create: mockFn(),
      update: mockFn(),
      delete: mockFn(),
      count: mockFn(),
    },
    recipeVersion: {
      create: mockFn(),
      findMany: mockFn(),
    },
    userFavourite: {
      findFirst: mockFn(),
      create: mockFn(),
      delete: mockFn(),
    },
  };
  mp.$transaction = mockFn((...args: unknown[]) =>
    (args[0] as (tx: unknown) => Promise<unknown>)(mp)
  );
  return mp;
};

describe("Recipe Module", () => {
  let app: Hono;
  let mockPrisma: ReturnType<typeof createLocalMockPrisma>;

  beforeEach(() => {
    mockPrisma = createLocalMockPrisma();
    setPrisma(mockPrisma);
    app = new Hono();
    app.route("/recipes", recipeModule);
    app.onError(testErrorHandler);
  });

  describe("GET /recipes", () => {
    it("should return paginated public recipes", async () => {
      const mockRecipes = [
        {
          id: "recipe_1",
          slug: "perfect-espresso",
          visibility: "PUBLIC",
          currentVersion: {
            title: "Perfect Espresso",
            brewMethod: "ESPRESSO_MACHINE",
            drinkType: "ESPRESSO",
            doseGrams: 18,
            yieldGrams: 36,
          },
          user: { username: "coffeemaster", displayName: "Coffee Master" },
        },
        {
          id: "recipe_2",
          slug: "morning-v60",
          visibility: "PUBLIC",
          currentVersion: {
            title: "Morning V60",
            brewMethod: "POUR_OVER_V60",
            drinkType: "POUR_OVER",
            doseGrams: 15,
          },
          user: { username: "barista", displayName: "Barista" },
        },
      ];

      mockPrisma.recipe.findMany.mockResolvedValue(mockRecipes);
      mockPrisma.recipe.count.mockResolvedValue(2);

      const response = await app.request("/recipes?visibility=PUBLIC");

      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.pagination).toBeDefined();
    });

    it("should filter by single brew method", async () => {
      mockPrisma.recipe.findMany.mockResolvedValue([]);
      mockPrisma.recipe.count.mockResolvedValue(0);

      const response = await app.request(
        "/recipes?brewMethod=ESPRESSO_MACHINE",
      );

      expect(response.status).toBe(200);
      expect(mockPrisma.recipe.findMany.calls.length).toBeGreaterThan(0);
    });

    it("should filter by multiple brew methods with OR logic (comma-separated)", async () => {
      mockPrisma.recipe.findMany.mockResolvedValue([]);
      mockPrisma.recipe.count.mockResolvedValue(0);

      const response = await app.request(
        "/recipes?brewMethod=ESPRESSO_MACHINE,POUR_OVER_V60",
      );

      expect(response.status).toBe(200);
      expect(mockPrisma.recipe.findMany.calls.length).toBeGreaterThan(0);
    });

    it("should filter by multiple drink types with OR logic (comma-separated)", async () => {
      mockPrisma.recipe.findMany.mockResolvedValue([]);
      mockPrisma.recipe.count.mockResolvedValue(0);

      const response = await app.request("/recipes?drinkType=ESPRESSO,LUNGO");

      expect(response.status).toBe(200);
      expect(mockPrisma.recipe.findMany.calls.length).toBeGreaterThan(0);
    });

    it("should filter by combined multiple brew methods and drink types", async () => {
      mockPrisma.recipe.findMany.mockResolvedValue([]);
      mockPrisma.recipe.count.mockResolvedValue(0);

      const response = await app.request(
        "/recipes?brewMethod=ESPRESSO_MACHINE,AEROPRESS&drinkType=ESPRESSO,AMERICANO",
      );

      expect(response.status).toBe(200);
      expect(mockPrisma.recipe.findMany.calls.length).toBeGreaterThan(0);
    });
  });

  describe("GET /recipes/:slug", () => {
    it("should return a recipe by slug", async () => {
      const fullRecipe = {
        id: "recipe_1",
        slug: "perfect-espresso",
        visibility: "PUBLIC",
        userId: "user_456",
        currentVersion: {
          id: "version_1",
          title: "Perfect Espresso",
          brewMethod: "ESPRESSO_MACHINE",
          drinkType: "ESPRESSO",
          doseGrams: 18,
          yieldGrams: 36,
          brewTimeSec: 28,
          description: "My perfect morning espresso",
        },
        user: { username: "coffeemaster", displayName: "Coffee Master" },
        _count: { versions: 1, forks: 0, comments: 0 },
      };

      // First call for slug lookup, second call for full recipe fetch
      mockPrisma.recipe.findUnique
        .mockResolvedValueOnce({ id: "recipe_1", slug: "perfect-espresso" })
        .mockResolvedValueOnce(fullRecipe);
      mockPrisma.recipe.update.mockResolvedValue({});

      const response = await app.request("/recipes/perfect-espresso");

      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.success).toBe(true);
      expect((body.data as { slug: string }).slug).toBe("perfect-espresso");
      expect(
        (body.data as { currentVersion: { title: string } }).currentVersion
          .title,
      ).toBe("Perfect Espresso");
    });

    it("should return 404 for non-existent recipe", async () => {
      mockPrisma.recipe.findUnique.mockResolvedValueOnce(null);

      const response = await app.request("/recipes/nonexistent-recipe");

      expect(response.status).toBe(404);
    });
  });

  describe("POST /recipes", () => {
    it("should create a new recipe", async () => {
      const mockCreatedRecipe = {
        id: "recipe_new",
        slug: "my-new-espresso",
        visibility: "DRAFT",
        userId: "user_123",
        versions: [{ id: "version_1" }],
        user: {
          id: "user_123",
          username: "testuser",
          displayName: "Test User",
          avatarUrl: null,
        },
      };

      const mockUpdatedRecipe = {
        id: "recipe_new",
        slug: "my-new-espresso",
        visibility: "DRAFT",
        userId: "user_123",
        currentVersionId: "version_1",
        currentVersion: {
          id: "version_1",
          title: "My New Espresso",
          brewMethod: "ESPRESSO_MACHINE",
          drinkType: "ESPRESSO",
          doseGrams: 18,
          yieldGrams: 36,
        },
        user: {
          id: "user_123",
          username: "testuser",
          displayName: "Test User",
          avatarUrl: null,
        },
      };

      mockPrisma.recipe.create.mockResolvedValue(mockCreatedRecipe);
      mockPrisma.recipe.update.mockResolvedValue(mockUpdatedRecipe);

      const response = await app.request("/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visibility: "DRAFT",
          version: {
            title: "My New Espresso",
            brewMethod: "ESPRESSO_MACHINE",
            drinkType: "ESPRESSO",
            doseGrams: 18,
            yieldGrams: 36,
          },
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json() as ApiResponse;
      expect(body.success).toBe(true);
    });

    it("should create a recipe with pressure field", async () => {
      const mockCreatedRecipe = {
        id: "recipe_pressure",
        slug: "espresso-with-pressure",
        visibility: "DRAFT",
        userId: "user_123",
        versions: [{ id: "version_1" }],
        user: {
          id: "user_123",
          username: "testuser",
          displayName: "Test User",
          avatarUrl: null,
        },
      };

      const mockUpdatedRecipe = {
        id: "recipe_pressure",
        slug: "espresso-with-pressure",
        visibility: "DRAFT",
        userId: "user_123",
        currentVersionId: "version_1",
        currentVersion: {
          id: "version_1",
          title: "Espresso with Pressure",
          brewMethod: "ESPRESSO_MACHINE",
          drinkType: "ESPRESSO",
          doseGrams: 18,
          yieldGrams: 36,
          pressure: "9",
        },
        user: {
          id: "user_123",
          username: "testuser",
          displayName: "Test User",
          avatarUrl: null,
        },
      };

      mockPrisma.recipe.create.mockResolvedValue(mockCreatedRecipe);
      mockPrisma.recipe.update.mockResolvedValue(mockUpdatedRecipe);

      const response = await app.request("/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visibility: "DRAFT",
          version: {
            title: "Espresso with Pressure",
            brewMethod: "ESPRESSO_MACHINE",
            drinkType: "ESPRESSO",
            doseGrams: 18,
            yieldGrams: 36,
            pressure: "9",
          },
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json() as ApiResponse;
      expect(body.success).toBe(true);
    });

    it("should accept variable pressure values", async () => {
      const mockCreatedRecipe = {
        id: "recipe_variable_pressure",
        slug: "gagguino-espresso",
        visibility: "DRAFT",
        userId: "user_123",
        versions: [{ id: "version_1" }],
        user: {
          id: "user_123",
          username: "testuser",
          displayName: "Test User",
          avatarUrl: null,
        },
      };

      mockPrisma.recipe.create.mockResolvedValue(mockCreatedRecipe);
      mockPrisma.recipe.update.mockResolvedValue({});

      const response = await app.request("/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visibility: "DRAFT",
          version: {
            title: "Gagguino Espresso",
            brewMethod: "ESPRESSO_MACHINE",
            drinkType: "ESPRESSO",
            doseGrams: 18,
            yieldGrams: 36,
            pressure: "6-9",
          },
        }),
      });

      expect(response.status).toBe(201);
    });

    it("should validate required fields", async () => {
      const response = await app.request("/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visibility: "PUBLIC",
          version: {
            // Missing required fields
          },
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe("PATCH /recipes/:id", () => {
    it("should update recipe visibility", async () => {
      const recipeId = "clh1234567890abcdefghij01";
      const mockRecipe = {
        id: recipeId,
        userId: "user_123",
        visibility: "DRAFT",
      };

      mockPrisma.recipe.findUnique.mockResolvedValue(mockRecipe);
      mockPrisma.recipe.update.mockResolvedValue({
        ...mockRecipe,
        visibility: "PUBLIC",
      });

      const response = await app.request(`/recipes/${recipeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visibility: "PUBLIC",
        }),
      });

      expect(response.status).toBe(200);
    });

    it("should reject update by non-owner", async () => {
      const recipeId = "clh1234567890abcdefghij01";
      const mockRecipe = {
        id: recipeId,
        userId: "other_user", // Different from auth user
        visibility: "DRAFT",
      };

      mockPrisma.recipe.findUnique.mockResolvedValue(mockRecipe);

      const response = await app.request(`/recipes/${recipeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visibility: "PUBLIC",
        }),
      });

      expect(response.status).toBe(403);
    });
  });

  describe("DELETE /recipes/:id", () => {
    it("should soft delete recipe (owner)", async () => {
      const recipeId = "clh1234567890abcdefghij01";
      const mockRecipe = {
        id: recipeId,
        userId: "user_123",
      };

      mockPrisma.recipe.findUnique.mockResolvedValue(mockRecipe);
      mockPrisma.recipe.update.mockResolvedValue({
        ...mockRecipe,
        deletedAt: new Date(),
      });

      const response = await app.request(`/recipes/${recipeId}`, {
        method: "DELETE",
      });

      expect(response.status).toBe(200);
    });

    it("should reject delete by non-owner", async () => {
      const recipeId = "clh1234567890abcdefghij01";
      const mockRecipe = {
        id: recipeId,
        userId: "other_user",
      };

      mockPrisma.recipe.findUnique.mockResolvedValue(mockRecipe);

      const response = await app.request(`/recipes/${recipeId}`, {
        method: "DELETE",
      });

      expect(response.status).toBe(403);
    });
  });

  describe("POST /recipes/:id/versions", () => {
    it("should create a new version", async () => {
      const recipeId = "clh1234567890abcdefghij01";
      const mockRecipe = {
        id: recipeId,
        userId: "user_123",
        currentVersionId: "version_1",
        versions: [{ versionNumber: 1 }],
      };

      const mockNewVersion = {
        id: "version_2",
        recipeId,
        versionNumber: 2,
        title: "Updated Espresso",
        brewMethod: "ESPRESSO_MACHINE",
        drinkType: "ESPRESSO",
        doseGrams: 18,
        yieldGrams: 40,
      };

      mockPrisma.recipe.findUnique.mockResolvedValue(mockRecipe);
      mockPrisma.recipeVersion.create.mockResolvedValue(mockNewVersion);
      mockPrisma.recipe.update.mockResolvedValue({});

      const response = await app.request(`/recipes/${recipeId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Updated Espresso",
          brewMethod: "ESPRESSO_MACHINE",
          drinkType: "ESPRESSO",
          doseGrams: 18,
          yieldGrams: 40,
        }),
      });

      expect(response.status).toBe(201);
    });
  });

  describe("POST /recipes/:id/fork", () => {
    it("should fork a public recipe", async () => {
      const originalRecipeId = "clh1234567890abcdefghij01";
      const mockOriginalRecipe = {
        id: originalRecipeId,
        userId: "other_user",
        visibility: "PUBLIC",
        currentVersion: {
          id: "version_1",
          title: "Original Espresso",
          description: "A great espresso",
          brewMethod: "ESPRESSO_MACHINE",
          drinkType: "ESPRESSO",
          coffeeId: null,
          coffeeName: null,
          roastDate: null,
          grindDate: null,
          grinderId: null,
          brewerId: null,
          portafilterId: null,
          basketId: null,
          puckScreenId: null,
          paperFilterId: null,
          tamperId: null,
          grindSize: null,
          doseGrams: 18,
          yieldMl: null,
          yieldGrams: 36,
          brewTimeSec: 28,
          tempCelsius: 93,
          pressure: "9",
          brewRatio: 2.0,
          flowRate: null,
          preparations: null,
          tastingNotes: null,
          rating: null,
          emojiRating: null,
          isFavourite: false,
          tags: [],
        },
      };

      const mockForkedRecipe = {
        id: "clh1234567890abcdefghij02",
        slug: "forked-original-espresso",
        userId: "user_123",
        forkedFromId: originalRecipeId,
        versions: [{ id: "new_version_1" }],
      };

      mockPrisma.recipe.findUnique.mockResolvedValue(mockOriginalRecipe);
      mockPrisma.recipe.create.mockResolvedValue(mockForkedRecipe);
      mockPrisma.recipe.update.mockResolvedValue({});

      const response = await app.request(`/recipes/${originalRecipeId}/fork`, {
        method: "POST",
      });

      expect(response.status).toBe(201);
    });

    it("should reject forking private recipes", async () => {
      const recipeId = "clh1234567890abcdefghij03";
      const mockRecipe = {
        id: recipeId,
        userId: "other_user",
        visibility: "PRIVATE",
        currentVersion: {
          id: "version_1",
          title: "Private Recipe",
        },
      };

      mockPrisma.recipe.findUnique.mockResolvedValue(mockRecipe);

      const response = await app.request(`/recipes/${recipeId}/fork`, {
        method: "POST",
      });

      expect(response.status).toBe(403);
    });

    it("should reject forking non-existent recipes", async () => {
      mockPrisma.recipe.findUnique.mockResolvedValue(null);

      const response = await app.request("/recipes/nonexistent/fork", {
        method: "POST",
      });

      expect(response.status).toBe(404);
    });
  });

  describe("GET /recipes/latest", () => {
    it("should return latest public recipes", async () => {
      const mockRecipes = [
        {
          id: "recipe_1",
          slug: "latest-espresso",
          visibility: "PUBLIC",
          currentVersion: {
            id: "v1",
            title: "Latest Espresso",
            brewMethod: "ESPRESSO_MACHINE",
            drinkType: "ESPRESSO",
            rating: 9,
          },
          user: {
            id: "user_1",
            username: "barista1",
            displayName: "Barista One",
            avatarUrl: null,
          },
        },
      ];

      mockPrisma.recipe.findMany.mockResolvedValue(mockRecipes);

      const response = await app.request("/recipes/latest");

      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });
  });

  describe("GET /recipes/popular", () => {
    it("should return popular public recipes", async () => {
      const mockRecipes = [
        {
          id: "recipe_1",
          slug: "popular-v60",
          visibility: "PUBLIC",
          favouriteCount: 100,
          currentVersion: {
            id: "v1",
            title: "Popular V60",
            brewMethod: "POUR_OVER_V60",
            drinkType: "POUR_OVER",
            rating: 10,
          },
          user: {
            id: "user_1",
            username: "master",
            displayName: "Coffee Master",
            avatarUrl: null,
          },
        },
      ];

      mockPrisma.recipe.findMany.mockResolvedValue(mockRecipes);

      const response = await app.request("/recipes/popular");

      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.success).toBe(true);
    });
  });

  describe("GET /recipes/:id/versions", () => {
    it("should return recipe versions for owner", async () => {
      const recipeId = "clh1234567890abcdefghij01";
      const mockRecipe = {
        id: recipeId,
        userId: "user_123",
        visibility: "PRIVATE",
      };

      const mockVersions = [
        { id: "v2", versionNumber: 2, title: "Updated Recipe" },
        { id: "v1", versionNumber: 1, title: "Original Recipe" },
      ];

      mockPrisma.recipe.findUnique.mockResolvedValue(mockRecipe);
      mockPrisma.recipeVersion.findMany.mockResolvedValue(mockVersions);

      const response = await app.request(`/recipes/${recipeId}/versions`);

      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(Array.isArray(body.data)).toBe(true);
    });

    it("should return recipe versions for public recipes", async () => {
      const recipeId = "clh1234567890abcdefghij01";
      const mockRecipe = {
        id: recipeId,
        userId: "other_user",
        visibility: "PUBLIC",
      };

      const mockVersions = [
        { id: "v1", versionNumber: 1, title: "Public Recipe" },
      ];

      mockPrisma.recipe.findUnique.mockResolvedValue(mockRecipe);
      mockPrisma.recipeVersion.findMany.mockResolvedValue(mockVersions);

      const response = await app.request(`/recipes/${recipeId}/versions`);

      expect(response.status).toBe(200);
    });

    it("should reject viewing versions of private recipes by non-owner", async () => {
      const recipeId = "clh1234567890abcdefghij01";
      const mockRecipe = {
        id: recipeId,
        userId: "other_user",
        visibility: "PRIVATE",
      };

      mockPrisma.recipe.findUnique.mockResolvedValue(mockRecipe);

      const response = await app.request(`/recipes/${recipeId}/versions`);

      expect(response.status).toBe(404);
    });

    it("should return 404 for non-existent recipe", async () => {
      mockPrisma.recipe.findUnique.mockResolvedValue(null);

      const response = await app.request("/recipes/nonexistent/versions");

      expect(response.status).toBe(404);
    });
  });

  describe("GET /recipes - filtering", () => {
    it("should filter recipes by brew method", async () => {
      const mockRecipes = [
        {
          id: "recipe_1",
          visibility: "PUBLIC",
          currentVersion: {
            title: "V60 Recipe",
            brewMethod: "POUR_OVER_V60",
            drinkType: "POUR_OVER",
          },
          user: { username: "user1" },
        },
      ];

      mockPrisma.recipe.findMany.mockResolvedValue(mockRecipes);
      mockPrisma.recipe.count.mockResolvedValue(1);

      const response = await app.request("/recipes?brewMethod=POUR_OVER_V60");

      expect(response.status).toBe(200);
    });

    it("should filter recipes by drink type", async () => {
      const mockRecipes = [
        {
          id: "recipe_1",
          visibility: "PUBLIC",
          currentVersion: {
            title: "Latte Recipe",
            brewMethod: "ESPRESSO_MACHINE",
            drinkType: "LATTE",
          },
          user: { username: "user1" },
        },
      ];

      mockPrisma.recipe.findMany.mockResolvedValue(mockRecipes);
      mockPrisma.recipe.count.mockResolvedValue(1);

      const response = await app.request("/recipes?drinkType=LATTE");

      expect(response.status).toBe(200);
    });

    it("should filter recipes by minimum rating", async () => {
      mockPrisma.recipe.findMany.mockResolvedValue([]);
      mockPrisma.recipe.count.mockResolvedValue(0);

      const response = await app.request("/recipes?minRating=8");

      expect(response.status).toBe(200);
    });

    it("should filter recipes by tags", async () => {
      mockPrisma.recipe.findMany.mockResolvedValue([]);
      mockPrisma.recipe.count.mockResolvedValue(0);

      const response = await app.request("/recipes?tags=morning,espresso");

      expect(response.status).toBe(200);
    });

    it("should search recipes by title", async () => {
      const mockRecipes = [
        {
          id: "recipe_1",
          visibility: "PUBLIC",
          currentVersion: {
            title: "Perfect Espresso",
            brewMethod: "ESPRESSO_MACHINE",
            drinkType: "ESPRESSO",
          },
          user: { username: "user1" },
        },
      ];

      mockPrisma.recipe.findMany.mockResolvedValue(mockRecipes);
      mockPrisma.recipe.count.mockResolvedValue(1);

      const response = await app.request("/recipes?search=espresso");

      expect(response.status).toBe(200);
    });
  });

  describe("DELETE /recipes/:id", () => {
    it("should soft delete own recipe", async () => {
      const recipeId = "clh1234567890abcdefghij01";
      const mockRecipe = {
        id: recipeId,
        userId: "user_123",
        visibility: "PUBLIC",
      };

      mockPrisma.recipe.findUnique.mockResolvedValue(mockRecipe);
      mockPrisma.recipe.update.mockResolvedValue({});

      const response = await app.request(`/recipes/${recipeId}`, {
        method: "DELETE",
      });

      expect(response.status).toBe(200);
    });

    it("should reject deleting others recipes", async () => {
      const recipeId = "clh1234567890abcdefghij01";
      const mockRecipe = {
        id: recipeId,
        userId: "other_user",
        visibility: "PUBLIC",
      };

      mockPrisma.recipe.findUnique.mockResolvedValue(mockRecipe);

      const response = await app.request(`/recipes/${recipeId}`, {
        method: "DELETE",
      });

      expect(response.status).toBe(403);
    });

    it("should return 404 for non-existent recipe", async () => {
      mockPrisma.recipe.findUnique.mockResolvedValue(null);

      const response = await app.request("/recipes/nonexistent", {
        method: "DELETE",
      });

      expect(response.status).toBe(404);
    });
  });
});
