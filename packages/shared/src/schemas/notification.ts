import { z } from 'zod';
import { PaginationSchema } from './common.ts';

/**
 * Validates notification-list query parameters: standard pagination plus an
 * optional `unreadOnly` filter.
 *
 * `unreadOnly` is coerced from the query string via `z.stringbool()` (Zod 4)
 * rather than `z.coerce.boolean()`, which would treat the string `'false'` as
 * `true` (`Boolean('false') === true`). It accepts the usual boolish strings
 * (`'true'`/`'false'`, `'1'`/`'0'`, `'yes'`/`'no'`, …) and defaults to `false`
 * when the param is absent.
 *
 * Used by GET /api/v1/notifications.
 */
export const NotificationQuerySchema = PaginationSchema.extend({
  unreadOnly: z.stringbool().default(false),
});

/** Inferred TypeScript type for notification-list query parameters. */
export type NotificationQuery = z.infer<typeof NotificationQuerySchema>;
