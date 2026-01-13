/**
 * Notification Module Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import notificationModule from './index.js';

// API Response type for testing
interface ApiResponse {
  success: boolean;
  data?: unknown;
  error?: { code: string; message: string };
  message?: string;
  pagination?: { page: number; limit: number; total: number };
}

// Mock auth middleware
vi.mock('../../middleware/auth', () => ({
  requireAuth: vi.fn((c: { set: (key: string, value: unknown) => void; get: (key: string) => unknown }, next: () => Promise<void>) => {
    c.set('user', { id: 'user_123', isAdmin: false });
    return next();
  }),
}));

// Mock database utilities
vi.mock('../../utils/database/index.js', () => ({
  getPrisma: vi.fn(),
  getPagination: vi.fn(({ page = 1, limit = 20 }: { page?: number; limit?: number }) => ({
    skip: (page - 1) * limit,
    take: limit,
  })),
  createPaginationMeta: vi.fn((page: number, limit: number, total: number) => ({
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    hasNext: page < Math.ceil(total / limit),
    hasPrev: page > 1,
  })),
}));

import { getPrisma } from '../../utils/database/index.js';

// Simple error handler for tests
const testErrorHandler = (err: Error & { statusCode?: number; code?: string }, c: { json: (body: unknown, status: number) => Response }) => {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  return c.json({ success: false, error: { code, message: err.message } }, statusCode);
};

// Create mock prisma instance
const mockPrisma = {
  notification: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
};

describe('Notification Module', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPrisma).mockReturnValue(mockPrisma as never);
    app = new Hono();
    app.route('/notifications', notificationModule);
    app.onError(testErrorHandler as never);
  });

  describe('GET /notifications', () => {
    it('should return user notifications', async () => {
      const mockNotifications = [
        {
          id: 'notif_1',
          userId: 'user_123',
          type: 'COMMENT_ON_RECIPE',
          title: 'New comment',
          message: 'Someone commented on your recipe',
          isRead: false,
          createdAt: new Date(),
          actor: { id: 'user_456', username: 'coffeefan', displayName: 'Coffee Fan' },
        },
        {
          id: 'notif_2',
          userId: 'user_123',
          type: 'RECIPE_FAVOURITED',
          title: 'Recipe favourited',
          message: 'Someone favourited your recipe',
          isRead: true,
          createdAt: new Date(),
          actor: { id: 'user_789', username: 'barista', displayName: 'Barista' },
        },
      ];

      vi.mocked(mockPrisma.notification.findMany).mockResolvedValue(mockNotifications as never);
      vi.mocked(mockPrisma.notification.count).mockResolvedValue(2);

      const response = await app.request('/notifications');

      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
    });

    it('should filter unread notifications when unreadOnly=true', async () => {
      const mockNotifications = [
        {
          id: 'notif_1',
          userId: 'user_123',
          type: 'COMMENT_ON_RECIPE',
          title: 'New comment',
          message: 'Someone commented',
          isRead: false,
          createdAt: new Date(),
          actor: null,
        },
      ];

      vi.mocked(mockPrisma.notification.findMany).mockResolvedValue(mockNotifications as never);
      vi.mocked(mockPrisma.notification.count).mockResolvedValue(1);

      const response = await app.request('/notifications?unreadOnly=true');

      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.success).toBe(true);
    });

    it('should support pagination', async () => {
      vi.mocked(mockPrisma.notification.findMany).mockResolvedValue([]);
      vi.mocked(mockPrisma.notification.count).mockResolvedValue(50);

      const response = await app.request('/notifications?page=2&limit=10');

      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.pagination).toBeDefined();
    });
  });

  describe('GET /notifications/unread-count', () => {
    it('should return unread notification count', async () => {
      vi.mocked(mockPrisma.notification.count).mockResolvedValue(5);

      const response = await app.request('/notifications/unread-count');

      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.success).toBe(true);
      expect((body.data as { count: number }).count).toBe(5);
    });

    it('should return zero when no unread notifications', async () => {
      vi.mocked(mockPrisma.notification.count).mockResolvedValue(0);

      const response = await app.request('/notifications/unread-count');

      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect((body.data as { count: number }).count).toBe(0);
    });
  });

  describe('POST /notifications/:id/read', () => {
    it('should mark notification as read', async () => {
      const mockNotification = {
        id: 'clh1234567890abcdefghij01',
        userId: 'user_123',
        isRead: false,
      };

      const updatedNotification = {
        ...mockNotification,
        isRead: true,
        readAt: new Date(),
      };

      vi.mocked(mockPrisma.notification.findUnique).mockResolvedValue(mockNotification as never);
      vi.mocked(mockPrisma.notification.update).mockResolvedValue(updatedNotification as never);

      const response = await app.request('/notifications/clh1234567890abcdefghij01/read', {
        method: 'POST',
      });

      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.success).toBe(true);
    });

    it('should return 404 for non-existent notification', async () => {
      vi.mocked(mockPrisma.notification.findUnique).mockResolvedValue(null);

      const response = await app.request('/notifications/clh1234567890abcdefghij99/read', {
        method: 'POST',
      });

      expect(response.status).toBe(404);
    });

    it('should return 404 when trying to read other users notification', async () => {
      const mockNotification = {
        id: 'clh1234567890abcdefghij01',
        userId: 'other_user', // Different user
        isRead: false,
      };

      vi.mocked(mockPrisma.notification.findUnique).mockResolvedValue(mockNotification as never);

      const response = await app.request('/notifications/clh1234567890abcdefghij01/read', {
        method: 'POST',
      });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /notifications/read-all', () => {
    it('should mark all notifications as read', async () => {
      vi.mocked(mockPrisma.notification.updateMany).mockResolvedValue({ count: 5 } as never);

      const response = await app.request('/notifications/read-all', {
        method: 'POST',
      });

      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.success).toBe(true);
    });
  });

  describe('DELETE /notifications/:id', () => {
    it('should delete notification', async () => {
      const mockNotification = {
        id: 'clh1234567890abcdefghij01',
        userId: 'user_123',
      };

      vi.mocked(mockPrisma.notification.findUnique).mockResolvedValue(mockNotification as never);
      vi.mocked(mockPrisma.notification.delete).mockResolvedValue(mockNotification as never);

      const response = await app.request('/notifications/clh1234567890abcdefghij01', {
        method: 'DELETE',
      });

      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.success).toBe(true);
    });

    it('should return 404 for non-existent notification', async () => {
      vi.mocked(mockPrisma.notification.findUnique).mockResolvedValue(null);

      const response = await app.request('/notifications/clh1234567890abcdefghij99', {
        method: 'DELETE',
      });

      expect(response.status).toBe(404);
    });

    it('should return 404 when trying to delete other users notification', async () => {
      const mockNotification = {
        id: 'clh1234567890abcdefghij01',
        userId: 'other_user',
      };

      vi.mocked(mockPrisma.notification.findUnique).mockResolvedValue(mockNotification as never);

      const response = await app.request('/notifications/clh1234567890abcdefghij01', {
        method: 'DELETE',
      });

      expect(response.status).toBe(404);
    });
  });
});

describe('Notification Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPrisma).mockReturnValue(mockPrisma as never);
  });

  describe('createNotification', () => {
    it('should create a notification', async () => {
      const { createNotification } = await import('./service.js');
      
      const mockNotification = {
        id: 'notif_1',
        userId: 'user_456',
        type: 'COMMENT_ON_RECIPE',
        title: 'New comment',
        message: 'Someone commented on your recipe',
        actorId: 'user_123',
        recipeId: 'recipe_1',
        createdAt: new Date(),
      };

      vi.mocked(mockPrisma.notification.create).mockResolvedValue(mockNotification as never);

      const result = await createNotification({
        userId: 'user_456',
        type: 'COMMENT_ON_RECIPE',
        title: 'New comment',
        message: 'Someone commented on your recipe',
        actorId: 'user_123',
        recipeId: 'recipe_1',
      });

      expect(result).toBeDefined();
      expect(mockPrisma.notification.create).toHaveBeenCalled();
    });

    it('should not create notification when user notifies themselves', async () => {
      const { createNotification } = await import('./service.js');

      const result = await createNotification({
        userId: 'user_123',
        type: 'COMMENT_ON_RECIPE',
        title: 'New comment',
        message: 'You commented on your recipe',
        actorId: 'user_123', // Same as userId
        recipeId: 'recipe_1',
      });

      expect(result).toBeNull();
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });
  });

  describe('getUnreadCount', () => {
    it('should return count of unread notifications', async () => {
      const { getUnreadCount } = await import('./service.js');
      
      vi.mocked(mockPrisma.notification.count).mockResolvedValue(3);

      const count = await getUnreadCount('user_123');

      expect(count).toBe(3);
      expect(mockPrisma.notification.count).toHaveBeenCalledWith({
        where: { userId: 'user_123', isRead: false },
      });
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read', async () => {
      const { markAsRead } = await import('./service.js');
      
      const mockNotification = { id: 'notif_1', userId: 'user_123', isRead: false };
      const updatedNotification = { ...mockNotification, isRead: true, readAt: new Date() };

      vi.mocked(mockPrisma.notification.findUnique).mockResolvedValue(mockNotification as never);
      vi.mocked(mockPrisma.notification.update).mockResolvedValue(updatedNotification as never);

      const result = await markAsRead('notif_1', 'user_123');

      expect(result).toBeDefined();
      expect(result?.isRead).toBe(true);
    });

    it('should return null for notification belonging to different user', async () => {
      const { markAsRead } = await import('./service.js');
      
      const mockNotification = { id: 'notif_1', userId: 'other_user', isRead: false };

      vi.mocked(mockPrisma.notification.findUnique).mockResolvedValue(mockNotification as never);

      const result = await markAsRead('notif_1', 'user_123');

      expect(result).toBeNull();
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all notifications as read', async () => {
      const { markAllAsRead } = await import('./service.js');
      
      vi.mocked(mockPrisma.notification.updateMany).mockResolvedValue({ count: 5 } as never);

      const result = await markAllAsRead('user_123');

      expect(result.success).toBe(true);
      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user_123', isRead: false },
        data: expect.objectContaining({ isRead: true }),
      });
    });
  });

  describe('deleteNotification', () => {
    it('should delete notification', async () => {
      const { deleteNotification } = await import('./service.js');
      
      const mockNotification = { id: 'notif_1', userId: 'user_123' };

      vi.mocked(mockPrisma.notification.findUnique).mockResolvedValue(mockNotification as never);
      vi.mocked(mockPrisma.notification.delete).mockResolvedValue(mockNotification as never);

      const result = await deleteNotification('notif_1', 'user_123');

      expect(result).toEqual({ success: true });
    });

    it('should return null when notification not found', async () => {
      const { deleteNotification } = await import('./service.js');
      
      vi.mocked(mockPrisma.notification.findUnique).mockResolvedValue(null);

      const result = await deleteNotification('notif_1', 'user_123');

      expect(result).toBeNull();
    });
  });
});
