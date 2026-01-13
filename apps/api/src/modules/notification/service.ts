/**
 * BrewForm Notification Service
 * Handles notification creation and management
 */

import { getPrisma, getPagination, createPaginationMeta } from '../../utils/database/index.js';
import type { NotificationType } from '@prisma/client';

// ============================================
// Types
// ============================================

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  recipeId?: string;
  commentId?: string;
  actorId?: string;
}

// ============================================
// Service Functions
// ============================================

/**
 * Create a notification
 */
export async function createNotification(input: CreateNotificationInput) {
  const prisma = getPrisma();

  // Don't notify yourself
  if (input.actorId && input.userId === input.actorId) {
    return null;
  }

  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      link: input.link,
      recipeId: input.recipeId,
      commentId: input.commentId,
      actorId: input.actorId,
    },
  });

  return notification;
}

/**
 * Get notifications for a user
 */
export async function getUserNotifications(
  userId: string,
  page = 1,
  limit = 20,
  unreadOnly = false
) {
  const prisma = getPrisma();
  const pagination = getPagination({ page, limit });

  const where = {
    userId,
    ...(unreadOnly && { isRead: false }),
  };

  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      include: {
        actor: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      ...pagination,
    }),
    prisma.notification.count({ where }),
  ]);

  return {
    notifications,
    pagination: createPaginationMeta(page, limit, total),
  };
}

/**
 * Get unread notification count
 */
export async function getUnreadCount(userId: string) {
  const prisma = getPrisma();

  const count = await prisma.notification.count({
    where: {
      userId,
      isRead: false,
    },
  });

  return count;
}

/**
 * Mark notification as read
 */
export async function markAsRead(notificationId: string, userId: string) {
  const prisma = getPrisma();

  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notification || notification.userId !== userId) {
    return null;
  }

  return prisma.notification.update({
    where: { id: notificationId },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });
}

/**
 * Mark all notifications as read
 */
export async function markAllAsRead(userId: string) {
  const prisma = getPrisma();

  await prisma.notification.updateMany({
    where: {
      userId,
      isRead: false,
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });

  return { success: true };
}

/**
 * Delete a notification
 */
export async function deleteNotification(notificationId: string, userId: string) {
  const prisma = getPrisma();

  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notification || notification.userId !== userId) {
    return null;
  }

  await prisma.notification.delete({
    where: { id: notificationId },
  });

  return { success: true };
}

export const notificationService = {
  createNotification,
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};

export default notificationService;
