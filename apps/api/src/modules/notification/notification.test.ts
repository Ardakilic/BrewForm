/**
 * Notification Module Tests
 */

import { beforeEach, describe, it } from "@std/testing";
import { expect } from "@std/expect";
import { Hono } from "hono";
import { spy } from "@std/testing/mock";
import { setPrisma } from "../../test/mocks/database.ts";
import notificationModule from "./index.ts";

// API Response type for testing
interface ApiResponse {
  success: boolean;
  data?: unknown;
  error?: { code: string; message: string };
  message?: string;
  pagination?: { page: number; limit: number; total: number };
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
    notification: {
      findMany: spy(() => Promise.resolve([])),
      findUnique: spy(() => Promise.resolve(null)),
      create: spy(() => Promise.resolve({})),
      update: spy(() => Promise.resolve({})),
      updateMany: spy(() => Promise.resolve({ count: 0 })),
      delete: spy(() => Promise.resolve({})),
      count: spy(() => Promise.resolve(0)),
    },
  };
  return mp;
};

describe("Notification Module", () => {
  let app: Hono;
  let mockPrisma: ReturnType<typeof createLocalMockPrisma>;

  beforeEach(() => {
    mockPrisma = createLocalMockPrisma();
    setPrisma(mockPrisma);
    app = new Hono();
    app.route("/notifications", notificationModule);
    app.onError(testErrorHandler as never);
  });

  describe("GET /notifications", () => {
    it("should return user notifications", async () => {
      const mockNotifications = [
        {
          id: "notif_1",
          userId: "user_123",
          type: "COMMENT_ON_RECIPE",
          title: "New comment",
          message: "Someone commented on your recipe",
          isRead: false,
          createdAt: new Date(),
          actor: {
            id: "user_456",
            username: "coffeefan",
            displayName: "Coffee Fan",
          },
        },
        {
          id: "notif_2",
          userId: "user_123",
          type: "RECIPE_FAVOURITED",
          title: "Recipe favourited",
          message: "Someone favourited your recipe",
          isRead: true,
          createdAt: new Date(),
          actor: {
            id: "user_789",
            username: "barista",
            displayName: "Barista",
          },
        },
      ];

      mockPrisma.notification.findMany = spy(() =>
        Promise.resolve(mockNotifications)
      );
      mockPrisma.notification.count = spy(() => Promise.resolve(2));

      const response = await app.request("/notifications");

      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
    });

    it("should filter unread notifications when unreadOnly=true", async () => {
      const mockNotifications = [
        {
          id: "notif_1",
          userId: "user_123",
          type: "COMMENT_ON_RECIPE",
          title: "New comment",
          message: "Someone commented",
          isRead: false,
          createdAt: new Date(),
          actor: null,
        },
      ];

      mockPrisma.notification.findMany = spy(() =>
        Promise.resolve(mockNotifications)
      );
      mockPrisma.notification.count = spy(() => Promise.resolve(1));

      const response = await app.request("/notifications?unreadOnly=true");

      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.success).toBe(true);
    });

    it("should support pagination", async () => {
      mockPrisma.notification.findMany = spy(() => Promise.resolve([]));
      mockPrisma.notification.count = spy(() => Promise.resolve(50));

      const response = await app.request("/notifications?page=2&limit=10");

      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.pagination).toBeDefined();
    });
  });

  describe("GET /notifications/unread-count", () => {
    it("should return unread notification count", async () => {
      mockPrisma.notification.count = spy(() => Promise.resolve(5));

      const response = await app.request("/notifications/unread-count");

      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.success).toBe(true);
      expect((body.data as { count: number }).count).toBe(5);
    });

    it("should return zero when no unread notifications", async () => {
      mockPrisma.notification.count = spy(() => Promise.resolve(0));

      const response = await app.request("/notifications/unread-count");

      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect((body.data as { count: number }).count).toBe(0);
    });
  });

  describe("POST /notifications/:id/read", () => {
    it("should mark notification as read", async () => {
      const mockNotification = {
        id: "clh1234567890abcdefghij01",
        userId: "user_123",
        isRead: false,
      };
      const updatedNotification = {
        ...mockNotification,
        isRead: true,
        readAt: new Date(),
      };

      mockPrisma.notification.findUnique = spy(() =>
        Promise.resolve(mockNotification)
      );
      mockPrisma.notification.update = spy(() =>
        Promise.resolve(updatedNotification)
      );

      const response = await app.request(
        "/notifications/clh1234567890abcdefghij01/read",
        {
          method: "POST",
        },
      );

      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.success).toBe(true);
    });

    it("should return 404 for non-existent notification", async () => {
      mockPrisma.notification.findUnique = spy(() => Promise.resolve(null));

      const response = await app.request(
        "/notifications/clh1234567890abcdefghij99/read",
        {
          method: "POST",
        },
      );

      expect(response.status).toBe(404);
    });

    it("should return 404 when trying to read other users notification", async () => {
      const mockNotification = {
        id: "clh1234567890abcdefghij01",
        userId: "other_user", // Different user
        isRead: false,
      };

      mockPrisma.notification.findUnique = spy(() =>
        Promise.resolve(mockNotification)
      );

      const response = await app.request(
        "/notifications/clh1234567890abcdefghij01/read",
        {
          method: "POST",
        },
      );

      expect(response.status).toBe(404);
    });
  });

  describe("POST /notifications/read-all", () => {
    it("should mark all notifications as read", async () => {
      mockPrisma.notification.updateMany = spy(() =>
        Promise.resolve({ count: 5 })
      );

      const response = await app.request("/notifications/read-all", {
        method: "POST",
      });

      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.success).toBe(true);
    });
  });

  describe("DELETE /notifications/:id", () => {
    it("should delete notification", async () => {
      const mockNotification = {
        id: "clh1234567890abcdefghij01",
        userId: "user_123",
      };

      mockPrisma.notification.findUnique = spy(() =>
        Promise.resolve(mockNotification)
      );
      mockPrisma.notification.delete = spy(() =>
        Promise.resolve(mockNotification)
      );

      const response = await app.request(
        "/notifications/clh1234567890abcdefghij01",
        {
          method: "DELETE",
        },
      );

      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.success).toBe(true);
    });

    it("should return 404 for non-existent notification", async () => {
      mockPrisma.notification.findUnique = spy(() => Promise.resolve(null));

      const response = await app.request(
        "/notifications/clh1234567890abcdefghij99",
        {
          method: "DELETE",
        },
      );

      expect(response.status).toBe(404);
    });

    it("should return 404 when trying to delete other users notification", async () => {
      const mockNotification = {
        id: "clh1234567890abcdefghij01",
        userId: "other_user",
      };

      mockPrisma.notification.findUnique = spy(() =>
        Promise.resolve(mockNotification)
      );

      const response = await app.request(
        "/notifications/clh1234567890abcdefghij01",
        {
          method: "DELETE",
        },
      );

      expect(response.status).toBe(404);
    });
  });
});

describe("Notification Service", () => {
  let mockPrisma: ReturnType<typeof createLocalMockPrisma>;

  beforeEach(() => {
    mockPrisma = createLocalMockPrisma();
    setPrisma(mockPrisma);
  });

  describe("createNotification", () => {
    it("should create a notification", async () => {
      const { createNotification } = await import("./service.ts");

      const callCountBefore = mockPrisma.notification.create.calls.length;

      const result = await createNotification({
        userId: "user_456",
        type: "COMMENT_ON_RECIPE",
        title: "New comment",
        message: "Someone commented on your recipe",
        actorId: "user_123",
        recipeId: "recipe_1",
      });

      expect(result).toBeDefined();
      const newCalls = mockPrisma.notification.create.calls.slice(
        callCountBefore,
      );
      expect(newCalls.length).toBe(1);
    });

    it("should not create notification when user notifies themselves", async () => {
      const { createNotification } = await import("./service.ts");
      const callCountBefore = mockPrisma.notification.create.calls.length;

      const result = await createNotification({
        userId: "user_123",
        type: "COMMENT_ON_RECIPE",
        title: "New comment",
        message: "You commented on your recipe",
        actorId: "user_123", // Same as userId
        recipeId: "recipe_1",
      });

      expect(result).toBeNull();
      const newCalls = mockPrisma.notification.create.calls.slice(
        callCountBefore,
      );
      expect(newCalls.length).toBe(0);
    });
  });

  describe("getUnreadCount", () => {
    it("should return count of unread notifications", async () => {
      const { getUnreadCount } = await import("./service.ts");
      mockPrisma.notification.count = spy(() => Promise.resolve(7));
      const callCountBefore = mockPrisma.notification.count.calls.length;

      const count = await getUnreadCount("user_123");

      expect(count).toBe(7);
      const newCalls = mockPrisma.notification.count.calls.slice(
        callCountBefore,
      );
      expect(newCalls.length).toBe(1);
      expect(newCalls[0].args[0]).toEqual({
        where: { userId: "user_123", isRead: false },
      });
    });
  });

  describe("markAsRead", () => {
    it("should mark notification as read", async () => {
      const { markAsRead } = await import("./service.ts");

      const mockNotification = {
        id: "notif_1",
        userId: "user_123",
        isRead: false,
      };
      const updatedNotification = {
        ...mockNotification,
        isRead: true,
        readAt: new Date(),
      };

      mockPrisma.notification.findUnique = spy(() =>
        Promise.resolve(mockNotification)
      );
      mockPrisma.notification.update = spy(() =>
        Promise.resolve(updatedNotification)
      );

      const result = await markAsRead("notif_1", "user_123");

      expect(result).toBeDefined();
      expect(result?.isRead).toBe(true);
    });

    it("should return null for notification belonging to different user", async () => {
      const { markAsRead } = await import("./service.ts");

      const mockNotification = {
        id: "notif_1",
        userId: "other_user",
        isRead: false,
      };

      mockPrisma.notification.findUnique = spy(() =>
        Promise.resolve(mockNotification)
      );

      const result = await markAsRead("notif_1", "user_123");

      expect(result).toBeNull();
    });
  });

  describe("markAllAsRead", () => {
    it("should mark all notifications as read", async () => {
      const { markAllAsRead } = await import("./service.ts");
      const callCountBefore = mockPrisma.notification.updateMany.calls.length;

      const result = await markAllAsRead("user_123");

      expect(result.success).toBe(true);
      const newCalls = mockPrisma.notification.updateMany.calls.slice(
        callCountBefore,
      );
      expect(newCalls.length).toBe(1);
      expect(newCalls[0].args[0]).toEqual(
        expect.objectContaining({
          where: { userId: "user_123", isRead: false },
          data: expect.objectContaining({ isRead: true }),
        }),
      );
    });
  });

  describe("deleteNotification", () => {
    it("should delete notification", async () => {
      const { deleteNotification } = await import("./service.ts");

      const mockNotification = { id: "notif_1", userId: "user_123" };

      mockPrisma.notification.findUnique = spy(() =>
        Promise.resolve(mockNotification)
      );
      mockPrisma.notification.delete = spy(() =>
        Promise.resolve(mockNotification)
      );

      const result = await deleteNotification("notif_1", "user_123");

      expect(result).toEqual({ success: true });
    });

    it("should return null when notification not found", async () => {
      const { deleteNotification } = await import("./service.ts");

      mockPrisma.notification.findUnique = spy(() => Promise.resolve(null));

      const result = await deleteNotification("notif_1", "user_123");

      expect(result).toBeNull();
    });
  });
});
