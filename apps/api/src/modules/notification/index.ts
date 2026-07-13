import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { describeRoute, resolver } from 'hono-openapi';
import {
  ErrorEnvelopeSchema,
  MessageResponseSchema,
  NotificationOutputSchema,
  NotificationQuerySchema,
  paginatedEnvelope,
  successEnvelope,
  UnreadCountOutputSchema,
} from '@brewform/shared/schemas';
import { authMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import { error, paginated, success, zodValidationHook } from '../../utils/response/index.ts';
import type { AppEnv } from '../../types/hono.ts';
import type { Context, Next } from 'hono';

/** Dependency-injection proxy for test stubbing (auth middleware + service). */
export const deps = { authMiddleware, service };

/** Proxy that resolves authMiddleware at request time (supports test mocking via deps). */
async function authGuard(c: Context<AppEnv>, next: Next) {
  return deps.authMiddleware(c, next);
}

/** Hono sub-router for notification endpoints, mounted at `/api/v1/notifications`. */
const notification = new Hono<AppEnv>();

// GET / — List my notifications
notification.get(
  '/',
  describeRoute({
    tags: ['Notifications'],
    summary: 'List my notifications',
    description:
      "Paginated list of the authenticated user's notifications, newest first. Optionally filtered to unread only.",
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
      {
        name: 'perPage',
        in: 'query',
        required: false,
        schema: { type: 'integer', minimum: 1, maximum: 100 },
      },
      {
        name: 'unreadOnly',
        in: 'query',
        required: false,
        schema: { type: 'boolean', default: false },
      },
    ],
    responses: {
      200: {
        description: 'Paginated list of notifications',
        content: {
          'application/json': {
            schema: resolver(paginatedEnvelope(NotificationOutputSchema)),
          },
        },
      },
      400: {
        description: 'Validation error',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authGuard,
  zValidator('query', NotificationQuerySchema, zodValidationHook),
  async (c) => {
    const userId = c.get('userId') as string;
    const { page, perPage, unreadOnly } = c.req.valid('query');
    const result = await deps.service.listNotifications(userId, page, perPage, unreadOnly);
    return paginated(c, result.notifications, {
      page,
      perPage,
      total: result.total,
      totalPages: Math.ceil(result.total / perPage),
    });
  },
);

// GET /unread-count — Unread notification count
notification.get(
  '/unread-count',
  describeRoute({
    tags: ['Notifications'],
    summary: 'Get my unread notification count',
    description: "Returns the count of the authenticated user's unread notifications.",
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Unread notification count',
        content: {
          'application/json': { schema: resolver(successEnvelope(UnreadCountOutputSchema)) },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authGuard,
  async (c) => {
    const userId = c.get('userId') as string;
    const unreadCount = await deps.service.getUnreadCount(userId);
    return success(c, { count: unreadCount });
  },
);

// PATCH /read-all — Mark all my notifications as read
notification.patch(
  '/read-all',
  describeRoute({
    tags: ['Notifications'],
    summary: 'Mark all my notifications as read',
    description: "Marks all of the authenticated user's unread notifications as read.",
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'All notifications marked as read',
        content: {
          'application/json': { schema: resolver(successEnvelope(MessageResponseSchema)) },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authGuard,
  async (c) => {
    const userId = c.get('userId') as string;
    await deps.service.markAllAsRead(userId);
    return success(c, { message: 'All notifications marked as read' });
  },
);

// PATCH /:id/read — Mark a single notification as read
notification.patch(
  '/:id/read',
  describeRoute({
    tags: ['Notifications'],
    summary: 'Mark a notification as read',
    description:
      'Marks a single notification owned by the authenticated user as read. Idempotent for already-read notifications.',
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      200: {
        description: 'Notification marked as read',
        content: {
          'application/json': { schema: resolver(successEnvelope(NotificationOutputSchema)) },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      403: {
        description: 'Not your notification',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      404: {
        description: 'Notification not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authGuard,
  async (c) => {
    const id = c.req.param('id')!;
    const userId = c.get('userId') as string;
    try {
      const result = await deps.service.markAsRead(userId, id);
      return success(c, result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'NOTIFICATION_NOT_FOUND') {
        return error(c, 'NOT_FOUND', 'Notification not found', 404);
      }
      if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not your notification', 403);
      throw err;
    }
  },
);

export default notification;
