import { z } from 'zod';

/**
 * Notification Output Schemas — the wire shapes returned by the notification
 * endpoints (list + unread count).
 *
 * Following the sibling response-schema convention (see `comment.ts`,
 * `collection.ts`): timestamps are serialized as ISO strings (`z.string()`)
 * and nullable columns use `.nullable()`. `actorUsername` is not a stored
 * column — it is left-joined at list time for display, hence nullable.
 */
export const NotificationOutputSchema = z.object({
  id: z.string(),
  userId: z.string(),
  type: z.string(),
  actorId: z.string().nullable(),
  actorUsername: z.string().nullable(),
  referenceId: z.string().nullable(),
  referenceType: z.string().nullable(),
  metadata: z.string().nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});

/** Inferred type of {@link NotificationOutputSchema}. */
export type NotificationOutput = z.infer<typeof NotificationOutputSchema>;

/** Unread-count response shape for GET /api/v1/notifications/unread-count. */
export const UnreadCountOutputSchema = z.object({
  count: z.number().int().nonnegative(),
});

/** Inferred type of {@link UnreadCountOutputSchema}. */
export type UnreadCountOutput = z.infer<typeof UnreadCountOutputSchema>;
