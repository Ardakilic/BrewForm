import { z } from 'zod';
import { UuidSchema } from './common.ts';

/** Validates a follow-target payload (user id). The follow routes currently take the id as a path param instead. */
export const FollowSchema = z.object({
  userId: UuidSchema,
});
