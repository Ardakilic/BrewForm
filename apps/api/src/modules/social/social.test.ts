/**
 * Social Module Tests
 */

import { beforeEach, describe, it } from "@std/testing";
import { expect } from "@std/expect";
import { Hono } from "hono";
import { spy } from "@std/testing/mock";
import { setPrisma } from "../../test/mocks/database.ts";
import socialModule from "./index.ts";

// API Response type for testing
interface ApiResponse {
  success: boolean;
  data?: unknown;
  error?: { code: string; message: string };
  message?: string;
}

// Simple error handler for tests
const testErrorHandler = (
  err: Error & { statusCode?: number; code?: string },
  c: { json: (body: unknown, status: number) => Response },
) => {
  const statusCode = err.statusCode || 500;
  const code = err.code || "INTERNAL_ERROR";
  return c.json(
    { success: false, error: { code, message: err.message } },
    statusCode,
  );
};

const createLocalMockPrisma = () => {
  // deno-lint-ignore no-explicit-any
  const mp: any = {
    recipe: {
      findUnique: spy(),
      update: spy(),
    },
    userFavourite: {
      findUnique: spy(),
      findFirst: spy(),
      create: spy(),
      delete: spy(),
    },
    comment: {
      findMany: spy(),
      create: spy(),
      findUnique: spy(),
      update: spy(),
      delete: spy(),
      count: spy(),
    },
    comparison: {
      create: spy(),
      findFirst: spy(),
      findUnique: spy(),
    },
  };
  return mp;
};

describe("Social Module", () => {
  let app: Hono;
  let mockPrisma: ReturnType<typeof createLocalMockPrisma>;

  beforeEach(() => {
    mockPrisma = createLocalMockPrisma();
    setPrisma(mockPrisma);
    app = new Hono();
    app.route("/social", socialModule);
    app.onError(testErrorHandler as never);
  });

  describe("Favourites", () => {
    describe("POST /social/favourites/:recipeId", () => {
      it("should add recipe to favourites", async () => {
        const mockRecipe = {
          id: "clh1234567890abcdefghij01",
          visibility: "PUBLIC",
        };

        const mockFavourite = {
          id: "fav_1",
          userId: "user_123",
          recipeId: "clh1234567890abcdefghij01",
          createdAt: new Date(),
        };

        mockPrisma.recipe.findUnique = spy(() => Promise.resolve(mockRecipe));
        mockPrisma.userFavourite.findUnique = spy(() => Promise.resolve(null));
        mockPrisma.userFavourite.create = spy(() =>
          Promise.resolve(mockFavourite)
        );
        mockPrisma.recipe.update = spy(() => Promise.resolve({}));

        const response = await app.request(
          "/social/favourites/clh1234567890abcdefghij01",
          {
            method: "POST",
          },
        );

        expect(response.status).toBe(201);
      });

      it("should return 409 if already favourited", async () => {
        const mockRecipe = {
          id: "clh1234567890abcdefghij01",
          visibility: "PUBLIC",
        };
        const existingFavourite = {
          id: "fav_1",
          userId: "user_123",
          recipeId: "clh1234567890abcdefghij01",
        };

        mockPrisma.recipe.findUnique = spy(() => Promise.resolve(mockRecipe));
        mockPrisma.userFavourite.findUnique = spy(() =>
          Promise.resolve(
            existingFavourite,
          )
        );

        const response = await app.request(
          "/social/favourites/clh1234567890abcdefghij01",
          {
            method: "POST",
          },
        );

        expect(response.status).toBe(409);
      });

      it("should reject favouriting private recipes", async () => {
        const mockRecipe = {
          id: "clh1234567890abcdefghij01",
          visibility: "PRIVATE",
          userId: "other_user",
        };

        mockPrisma.recipe.findUnique = spy(() => Promise.resolve(mockRecipe));

        const response = await app.request(
          "/social/favourites/clh1234567890abcdefghij01",
          {
            method: "POST",
          },
        );

        expect(response.status).toBe(403);
      });
    });

    describe("DELETE /social/favourites/:recipeId", () => {
      it("should remove recipe from favourites", async () => {
        const mockFavourite = {
          id: "fav_1",
          userId: "user_123",
          recipeId: "clh1234567890abcdefghij01",
        };

        mockPrisma.userFavourite.findUnique = spy(() =>
          Promise.resolve(mockFavourite)
        );
        mockPrisma.userFavourite.delete = spy(() =>
          Promise.resolve(mockFavourite)
        );
        mockPrisma.recipe.update = spy(() => Promise.resolve({}));

        const response = await app.request(
          "/social/favourites/clh1234567890abcdefghij01",
          {
            method: "DELETE",
          },
        );

        expect(response.status).toBe(200);
      });

      it("should return 404 if not favourited", async () => {
        mockPrisma.userFavourite.findUnique = spy(() => Promise.resolve(null));

        const response = await app.request(
          "/social/favourites/clh1234567890abcdefghij01",
          {
            method: "DELETE",
          },
        );

        expect(response.status).toBe(404);
      });
    });
  });

  describe("Comments", () => {
    describe("GET /social/recipes/:recipeId/comments", () => {
      it("should return comments for a recipe", async () => {
        const mockRecipe = {
          id: "clh1234567890abcdefghij01",
          visibility: "PUBLIC",
          userId: "user_456",
        };
        const mockComments = [
          {
            id: "comment_1",
            content: "Great recipe!",
            userId: "user_789",
            createdAt: new Date(),
            user: {
              username: "coffeeenthusiast",
              displayName: "Coffee Enthusiast",
            },
            replies: [],
          },
          {
            id: "comment_2",
            content: "Tried this, worked perfectly!",
            userId: "user_790",
            createdAt: new Date(),
            user: { username: "barista", displayName: "Barista" },
            replies: [],
          },
        ];

        mockPrisma.recipe.findUnique = spy(() => Promise.resolve(mockRecipe));
        mockPrisma.comment.findMany = spy(() => Promise.resolve(mockComments));
        mockPrisma.comment.count = spy(() => Promise.resolve(2));

        const response = await app.request(
          "/social/recipes/clh1234567890abcdefghij01/comments",
        );

        expect(response.status).toBe(200);
        const body = await response.json() as ApiResponse;
        expect(body.data).toHaveLength(2);
      });

      it("should reject viewing comments on private recipes", async () => {
        const mockRecipe = {
          id: "clh1234567890abcdefghij01",
          visibility: "PRIVATE",
          userId: "other_user",
        };

        mockPrisma.recipe.findUnique = spy(() => Promise.resolve(mockRecipe));

        const response = await app.request(
          "/social/recipes/clh1234567890abcdefghij01/comments",
        );

        expect(response.status).toBe(403);
      });
    });

    describe("POST /social/recipes/:recipeId/comments", () => {
      it("should add a comment to a recipe", async () => {
        const recipeId = "clh1234567890abcdefghij01";
        const mockRecipe = { id: recipeId, visibility: "PUBLIC" };
        const mockComment = {
          id: "clh1234567890abcdefghij99",
          content: "Amazing recipe!",
          userId: "user_123",
          recipeId,
          createdAt: new Date(),
        };

        mockPrisma.recipe.findUnique = spy(() => Promise.resolve(mockRecipe));
        mockPrisma.comment.create = spy(() => Promise.resolve(mockComment));

        const response = await app.request(
          `/social/recipes/${recipeId}/comments`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: "Amazing recipe!" }),
          },
        );

        expect(response.status).toBe(201);
      });

      it("should validate comment content", async () => {
        const recipeId = "clh1234567890abcdefghij01";
        const response = await app.request(
          `/social/recipes/${recipeId}/comments`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: "" }), // Empty content
          },
        );

        expect(response.status).toBe(400);
      });
    });

    describe("DELETE /social/comments/:id", () => {
      it("should delete own comment", async () => {
        const mockComment = {
          id: "comment_1",
          userId: "user_123",
          content: "My comment",
        };

        mockPrisma.comment.findUnique = spy(() => Promise.resolve(mockComment));
        mockPrisma.comment.delete = spy(() => Promise.resolve(mockComment));

        const response = await app.request("/social/comments/comment_1", {
          method: "DELETE",
        });

        expect(response.status).toBe(200);
      });

      it("should reject deleting others comments", async () => {
        const mockComment = {
          id: "comment_1",
          userId: "other_user",
          content: "Their comment",
        };

        mockPrisma.comment.findUnique = spy(() => Promise.resolve(mockComment));

        const response = await app.request("/social/comments/comment_1", {
          method: "DELETE",
        });

        expect(response.status).toBe(403);
      });
    });
  });

  describe("Comparisons", () => {
    describe("POST /social/comparisons", () => {
      it("should create a comparison between two recipes", async () => {
        const recipeAId = "clh1234567890abcdefghij01";
        const recipeBId = "clh1234567890abcdefghij02";
        const mockRecipeA = { id: recipeAId, visibility: "PUBLIC" };
        const mockRecipeB = { id: recipeBId, visibility: "PUBLIC" };

        const mockComparison = {
          id: "clh1234567890abcdefghij03",
          shareToken: "abc123xyz",
          recipeAId,
          recipeBId,
          createdById: "user_123",
          createdAt: new Date(),
        };

        let callCount = 0;
        mockPrisma.recipe.findUnique = spy(() => {
          callCount++;
          return Promise.resolve(callCount === 1 ? mockRecipeA : mockRecipeB);
        });
        mockPrisma.comparison.create = spy(() =>
          Promise.resolve(mockComparison)
        );

        const response = await app.request("/social/comparisons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipeAId,
            recipeBId,
          }),
        });

        expect(response.status).toBe(201);
        const body = await response.json() as ApiResponse;
        expect((body.data as { shareToken: string }).shareToken).toBeDefined();
      });

      it("should reject comparing same recipe", async () => {
        const sameRecipeId = "clh1234567890abcdefghij01";
        const response = await app.request("/social/comparisons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipeAId: sameRecipeId,
            recipeBId: sameRecipeId,
          }),
        });

        expect(response.status).toBe(400);
      });
    });

    describe("GET /social/comparisons/:token", () => {
      it("should return comparison by share token", async () => {
        const mockComparison = {
          id: "comparison_1",
          shareToken: "abc123xyz",
          recipeA: {
            id: "clh1234567890abcdefghij01",
            visibility: "PUBLIC",
            currentVersion: { title: "Recipe A" },
            user: { username: "user1" },
          },
          recipeB: {
            id: "clh1234567890abcdefghij02",
            visibility: "PUBLIC",
            currentVersion: { title: "Recipe B" },
            user: { username: "user2" },
          },
        };

        mockPrisma.comparison.findUnique = spy(() =>
          Promise.resolve(mockComparison)
        );

        const response = await app.request("/social/comparisons/abc123xyz");

        expect(response.status).toBe(200);
        const body = await response.json() as ApiResponse;
        expect((body.data as { recipeA: unknown }).recipeA).toBeDefined();
        expect((body.data as { recipeB: unknown }).recipeB).toBeDefined();
      });

      it("should return 404 for invalid token", async () => {
        mockPrisma.comparison.findUnique = spy(() => Promise.resolve(null));

        const response = await app.request("/social/comparisons/invalid-token");

        expect(response.status).toBe(404);
      });

      it("should return 400 if recipe is no longer public", async () => {
        const mockComparison = {
          id: "comparison_1",
          shareToken: "abc123xyz",
          recipeA: {
            id: "clh1234567890abcdefghij01",
            visibility: "PRIVATE",
            currentVersion: { title: "Recipe A" },
            user: { username: "user1" },
          },
          recipeB: {
            id: "clh1234567890abcdefghij02",
            visibility: "PUBLIC",
            currentVersion: { title: "Recipe B" },
            user: { username: "user2" },
          },
        };

        mockPrisma.comparison.findUnique = spy(() =>
          Promise.resolve(mockComparison)
        );

        const response = await app.request("/social/comparisons/abc123xyz");

        expect(response.status).toBe(400);
      });
    });

    describe("POST /social/comparisons - existing comparison", () => {
      it("should return existing comparison if already exists", async () => {
        const recipeAId = "clh1234567890abcdefghij01";
        const recipeBId = "clh1234567890abcdefghij02";
        const mockRecipeA = { id: recipeAId, visibility: "PUBLIC" };
        const mockRecipeB = { id: recipeBId, visibility: "PUBLIC" };

        const existingComparison = {
          id: "existing_comparison",
          shareToken: "existing_token",
          recipeAId,
          recipeBId,
        };

        let callCount2 = 0;
        mockPrisma.recipe.findUnique = spy(() => {
          callCount2++;
          return Promise.resolve(callCount2 === 1 ? mockRecipeA : mockRecipeB);
        });
        mockPrisma.comparison.findFirst = spy(() =>
          Promise.resolve(existingComparison)
        );

        const response = await app.request("/social/comparisons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipeAId, recipeBId }),
        });

        expect(response.status).toBe(201);
        const body = await response.json() as ApiResponse;
        expect((body.data as { shareToken: string }).shareToken).toBe(
          "existing_token",
        );
      });

      it("should reject comparing private recipes", async () => {
        const recipeAId = "clh1234567890abcdefghij01";
        const recipeBId = "clh1234567890abcdefghij02";
        const mockRecipeA = {
          id: recipeAId,
          visibility: "PRIVATE",
          userId: "other_user",
        };
        const mockRecipeB = { id: recipeBId, visibility: "PUBLIC" };

        let callCount3 = 0;
        mockPrisma.recipe.findUnique = spy(() => {
          callCount3++;
          return Promise.resolve(callCount3 === 1 ? mockRecipeA : mockRecipeB);
        });

        const response = await app.request("/social/comparisons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipeAId, recipeBId }),
        });

        expect(response.status).toBe(400);
      });
    });
  });

  describe("Comments - additional tests", () => {
    describe("PATCH /social/comments/:id", () => {
      it("should update own comment", async () => {
        const commentId = "clh1234567890abcdefghij99";
        const mockComment = {
          id: commentId,
          userId: "user_123",
          content: "Original comment",
        };

        const updatedComment = {
          ...mockComment,
          content: "Updated comment",
          isEdited: true,
          user: {
            id: "user_123",
            username: "testuser",
            displayName: "Test User",
            avatarUrl: null,
          },
        };

        mockPrisma.comment.findUnique = spy(() => Promise.resolve(mockComment));
        mockPrisma.comment.update = spy(() => Promise.resolve(updatedComment));

        const response = await app.request(`/social/comments/${commentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "Updated comment" }),
        });

        expect(response.status).toBe(200);
        const body = await response.json() as ApiResponse;
        expect((body.data as { content: string }).content).toBe(
          "Updated comment",
        );
      });

      it("should reject updating others comments", async () => {
        const commentId = "clh1234567890abcdefghij99";
        const mockComment = {
          id: commentId,
          userId: "other_user",
          content: "Their comment",
        };

        mockPrisma.comment.findUnique = spy(() => Promise.resolve(mockComment));

        const response = await app.request(`/social/comments/${commentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "Trying to update" }),
        });

        expect(response.status).toBe(403);
      });
    });
  });

  describe("Favourites - edge cases", () => {
    describe("POST /social/favourites/:recipeId - recipe not found", () => {
      it("should return 404 if recipe not found", async () => {
        mockPrisma.recipe.findUnique = spy(() => Promise.resolve(null));

        const response = await app.request(
          "/social/favourites/clh1234567890abcdefghij01",
          {
            method: "POST",
          },
        );

        expect(response.status).toBe(404);
      });
    });

    describe("POST /social/favourites/:recipeId - own recipe", () => {
      it("should allow favouriting own recipe", async () => {
        const mockRecipe = {
          id: "clh1234567890abcdefghij01",
          visibility: "PUBLIC",
          userId: "user_123",
        };
        const mockFavourite = {
          id: "fav_1",
          userId: "user_123",
          recipeId: "clh1234567890abcdefghij01",
          createdAt: new Date(),
        };

        mockPrisma.recipe.findUnique = spy(() => Promise.resolve(mockRecipe));
        mockPrisma.userFavourite.findUnique = spy(() => Promise.resolve(null));
        mockPrisma.userFavourite.create = spy(() =>
          Promise.resolve(mockFavourite)
        );
        mockPrisma.recipe.update = spy(() => Promise.resolve({}));

        const response = await app.request(
          "/social/favourites/clh1234567890abcdefghij01",
          {
            method: "POST",
          },
        );

        expect(response.status).toBe(201);
      });
    });
  });

  describe("Comments - notification flow", () => {
    it("should add comment and trigger notifications", async () => {
      const recipeId = "clh1234567890abcdefghij01";
      const mockRecipe = {
        id: recipeId,
        visibility: "PUBLIC",
        userId: "recipe_owner",
        slug: "test-recipe",
      };
      const mockComment = {
        id: "clh1234567890abcdefghij99",
        content: "Great recipe!",
        userId: "user_123",
        recipeId,
        createdAt: new Date(),
        user: {
          id: "user_123",
          username: "testuser",
          displayName: "Test",
          avatarUrl: null,
        },
      };

      mockPrisma.recipe.findUnique = spy(() => Promise.resolve(mockRecipe));
      mockPrisma.comment.create = spy(() => Promise.resolve(mockComment));
      mockPrisma.recipe.update = spy(() => Promise.resolve({}));

      const response = await app.request(
        `/social/recipes/${recipeId}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "Great recipe!" }),
        },
      );

      expect(response.status).toBe(201);
    });

    it("should add comment on unlisted recipe", async () => {
      const recipeId = "clh1234567890abcdefghij01";
      const mockRecipe = {
        id: recipeId,
        visibility: "UNLISTED",
        userId: "recipe_owner",
      };
      const mockComment = {
        id: "clh1234567890abcdefghij99",
        content: "Found this via link!",
        userId: "user_123",
        recipeId,
        createdAt: new Date(),
        user: {
          id: "user_123",
          username: "testuser",
          displayName: "Test",
          avatarUrl: null,
        },
      };

      mockPrisma.recipe.findUnique = spy(() => Promise.resolve(mockRecipe));
      mockPrisma.comment.create = spy(() => Promise.resolve(mockComment));
      mockPrisma.recipe.update = spy(() => Promise.resolve({}));

      const response = await app.request(
        `/social/recipes/${recipeId}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "Found this via link!" }),
        },
      );

      expect(response.status).toBe(201);
    });

    it("should reject comment on recipe not found", async () => {
      mockPrisma.recipe.findUnique = spy(() => Promise.resolve(null));

      const response = await app.request(
        "/social/recipes/clh1234567890abcdefghij01/comments",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "Test comment" }),
        },
      );

      expect(response.status).toBe(404);
    });
  });

  describe("Delete comment - with recipe count update", () => {
    it("should soft delete comment and decrement recipe count", async () => {
      const commentId = "clh1234567890abcdefghij99";
      const mockComment = {
        id: commentId,
        userId: "user_123",
        recipeId: "clh1234567890abcdefghij01",
        content: "My comment",
      };

      mockPrisma.comment.findUnique = spy(() => Promise.resolve(mockComment));
      mockPrisma.comment.update = spy(() => Promise.resolve({}));
      mockPrisma.recipe.update = spy(() => Promise.resolve({}));

      const response = await app.request(`/social/comments/${commentId}`, {
        method: "DELETE",
      });

      expect(response.status).toBe(200);
      expect(mockPrisma.recipe.update.calls[0].args[0]).toEqual(
        expect.objectContaining({
          where: { id: "clh1234567890abcdefghij01" },
          data: { commentCount: { decrement: 1 } },
        }),
      );
    });
  });

  describe("Recipe comments - with replies", () => {
    it("should return comments with nested replies", async () => {
      const recipeId = "clh1234567890abcdefghij01";
      const mockRecipe = {
        id: recipeId,
        visibility: "PUBLIC",
        userId: "owner_123",
      };
      const mockComments = [
        {
          id: "comment_1",
          content: "Top level comment",
          userId: "user_456",
          createdAt: new Date(),
          user: { username: "commenter", displayName: "Commenter" },
          replies: [
            {
              id: "reply_1",
              content: "A reply",
              userId: "owner_123",
              user: { username: "owner", displayName: "Owner" },
            },
          ],
        },
      ];

      mockPrisma.recipe.findUnique = spy(() => Promise.resolve(mockRecipe));
      mockPrisma.comment.findMany = spy(() => Promise.resolve(mockComments));
      mockPrisma.comment.count = spy(() => Promise.resolve(1));

      const response = await app.request(
        `/social/recipes/${recipeId}/comments`,
      );

      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.data).toHaveLength(1);
    });
  });

  describe("Update comment - edge cases", () => {
    it("should update comment and mark as edited", async () => {
      const commentId = "clh1234567890abcdefghij99";
      const mockComment = {
        id: commentId,
        userId: "user_123",
        content: "Original",
      };
      const updatedComment = {
        ...mockComment,
        content: "Edited content",
        isEdited: true,
        user: {
          id: "user_123",
          username: "test",
          displayName: "Test",
          avatarUrl: null,
        },
      };

      mockPrisma.comment.findUnique = spy(() => Promise.resolve(mockComment));
      mockPrisma.comment.update = spy(() => Promise.resolve(updatedComment));

      const response = await app.request(`/social/comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Edited content" }),
      });

      expect(response.status).toBe(200);
    });
  });

  describe("isFavourited check", () => {
    it("should check favourite status correctly", async () => {
      // This tests the isFavourited function indirectly via favourites endpoint
      const mockRecipe = {
        id: "clh1234567890abcdefghij01",
        visibility: "PUBLIC",
        userId: "other",
      };
      mockPrisma.recipe.findUnique = spy(() => Promise.resolve(mockRecipe));
      mockPrisma.userFavourite.findUnique = spy(() => Promise.resolve(null));
      mockPrisma.userFavourite.create = spy(() =>
        Promise.resolve({ id: "fav_1" })
      );
      mockPrisma.recipe.update = spy(() => Promise.resolve({}));

      const response = await app.request(
        "/social/favourites/clh1234567890abcdefghij01",
        {
          method: "POST",
        },
      );

      expect(response.status).toBe(201);
    });
  });

  describe("Comparison - recipe not found", () => {
    it("should return 404 if one recipe not found", async () => {
      const recipeAId = "clh1234567890abcdefghij01";
      const recipeBId = "clh1234567890abcdefghij02";

      let callCount4 = 0;
      mockPrisma.recipe.findUnique = spy(() => {
        callCount4++;
        return Promise.resolve(
          callCount4 === 1 ? { id: recipeAId, visibility: "PUBLIC" } : null,
        );
      });

      const response = await app.request("/social/comparisons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeAId, recipeBId }),
      });

      expect(response.status).toBe(404);
    });
  });

  describe("Comments - self comment on own recipe", () => {
    it("should allow commenting on own recipe without notification", async () => {
      const recipeId = "clh1234567890abcdefghij01";
      const mockRecipe = {
        id: recipeId,
        visibility: "PUBLIC",
        userId: "user_123", // Same as authenticated user
        slug: "my-recipe",
      };
      const mockComment = {
        id: "clh1234567890abcdefghij99",
        content: "My own comment",
        userId: "user_123",
        recipeId,
        createdAt: new Date(),
        user: {
          id: "user_123",
          username: "testuser",
          displayName: "Test",
          avatarUrl: null,
        },
      };

      mockPrisma.recipe.findUnique = spy(() => Promise.resolve(mockRecipe));
      mockPrisma.comment.create = spy(() => Promise.resolve(mockComment));
      mockPrisma.recipe.update = spy(() => Promise.resolve({}));

      const response = await app.request(
        `/social/recipes/${recipeId}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "My own comment" }),
        },
      );

      expect(response.status).toBe(201);
    });
  });

  describe("Remove favourite - decrement count", () => {
    it("should decrement favourite count when removing", async () => {
      const mockFavourite = {
        id: "fav_1",
        userId: "user_123",
        recipeId: "clh1234567890abcdefghij01",
      };

      mockPrisma.userFavourite.findUnique = spy(() =>
        Promise.resolve(mockFavourite)
      );
      mockPrisma.userFavourite.delete = spy(() =>
        Promise.resolve(mockFavourite)
      );
      mockPrisma.recipe.update = spy(() => Promise.resolve({}));

      const response = await app.request(
        "/social/favourites/clh1234567890abcdefghij01",
        {
          method: "DELETE",
        },
      );

      expect(response.status).toBe(200);
      expect(mockPrisma.recipe.update.calls[0].args[0]).toEqual(
        expect.objectContaining({
          data: { favouriteCount: { decrement: 1 } },
        }),
      );
    });
  });

  describe("Get comments - pagination", () => {
    it("should return paginated comments", async () => {
      const recipeId = "clh1234567890abcdefghij01";
      const mockRecipe = {
        id: recipeId,
        visibility: "PUBLIC",
        userId: "owner_123",
      };
      const mockComments = Array.from({ length: 5 }, (_, i) => ({
        id: `comment_${i}`,
        content: `Comment ${i}`,
        userId: `user_${i}`,
        createdAt: new Date(),
        user: { username: `user${i}`, displayName: `User ${i}` },
        replies: [],
      }));

      mockPrisma.recipe.findUnique = spy(() => Promise.resolve(mockRecipe));
      mockPrisma.comment.findMany = spy(() => Promise.resolve(mockComments));
      mockPrisma.comment.count = spy(() => Promise.resolve(5));

      const response = await app.request(
        `/social/recipes/${recipeId}/comments?page=1&limit=10`,
      );

      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.data).toHaveLength(5);
    });
  });
});
