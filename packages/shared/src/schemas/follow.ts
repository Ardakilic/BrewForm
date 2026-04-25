import { z } from 'zod';
import { UuidSchema } from './common.ts';

export const FollowSchema = z.object({
  userId: UuidSchema,
});