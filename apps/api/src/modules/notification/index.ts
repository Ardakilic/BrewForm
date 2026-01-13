/**
 * BrewForm Notification Routes
 * Handles notification endpoints
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { paginationSchema } from '../../utils/validation/index.js';
import { notificationService } from './service.js';
import { requireAuth } from '../../middleware/auth.js';

const notifications = new Hono();

/**
 * GET /notifications
 * Get user's notifications
 */
notifications.get(
  '/',
  requireAuth,
  zValidator(
    'query',
    paginationSchema.extend({
      unreadOnly: z.enum(['true', 'false']).optional(),
    })
  ),
  async (c) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
    }
    const { page, limit, unreadOnly } = c.req.valid('query');

    const result = await notificationService.getUserNotifications(
      user.id,
      page,
      limit,
      unreadOnly === 'true'
    );

    return c.json({
      success: true,
      data: result.notifications,
      pagination: result.pagination,
    });
  }
);

/**
 * GET /notifications/unread-count
 * Get unread notification count
 */
notifications.get('/unread-count', requireAuth, async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
  }

  const count = await notificationService.getUnreadCount(user.id);

  return c.json({
    success: true,
    data: { count },
  });
});

/**
 * POST /notifications/:id/read
 * Mark a notification as read
 */
notifications.post(
  '/:id/read',
  requireAuth,
  zValidator('param', z.object({ id: z.string().cuid() })),
  async (c) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
    }
    const { id } = c.req.valid('param');

    const notification = await notificationService.markAsRead(id, user.id);

    if (!notification) {
      return c.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Notification not found' } },
        404
      );
    }

    return c.json({
      success: true,
      data: notification,
    });
  }
);

/**
 * POST /notifications/read-all
 * Mark all notifications as read
 */
notifications.post('/read-all', requireAuth, async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
  }

  await notificationService.markAllAsRead(user.id);

  return c.json({
    success: true,
    message: 'All notifications marked as read',
  });
});

/**
 * DELETE /notifications/:id
 * Delete a notification
 */
notifications.delete(
  '/:id',
  requireAuth,
  zValidator('param', z.object({ id: z.string().cuid() })),
  async (c) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
    }
    const { id } = c.req.valid('param');

    const result = await notificationService.deleteNotification(id, user.id);

    if (!result) {
      return c.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Notification not found' } },
        404
      );
    }

    return c.json({
      success: true,
      message: 'Notification deleted',
    });
  }
);

export default notifications;
