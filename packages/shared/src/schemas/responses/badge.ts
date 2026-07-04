import { z } from 'zod';

/**
 * Badge Output Schemas.
 *
 * `BadgeOutputSchema` mirrors the full `badges` row from `listBadges`
 * (`db.select().from(badges)`). `UserBadgeOutputSchema` mirrors the
 * `getUserBadges` projection — a `userBadges` row with the badge definition
 * left-joined (hence `badge` is nullable).
 *
 * Verified against `packages/db/src/schema.ts` (`badges`, `userBadges`) and
 * `apps/api/src/modules/badge/{service,model}.ts`.
 */
export const BadgeOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string(),
  description: z.string(),
  rule: z.string(),
  threshold: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type BadgeOutput = z.infer<typeof BadgeOutputSchema>;

/** Badge definition projection embedded in a user-badge row (leftJoin → nullable). */
const UserBadgeBadgeSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    icon: z.string(),
    description: z.string(),
    rule: z.string(),
    threshold: z.number().int(),
  })
  .nullable();

/** Validates a user-badge award row with its left-joined badge definition (nullable); used in badge response envelopes for `getUserBadges`. */
export const UserBadgeOutputSchema = z.object({
  id: z.string(),
  userId: z.string(),
  badgeId: z.string(),
  awardedAt: z.string(),
  badge: UserBadgeBadgeSchema,
});

export type UserBadgeOutput = z.infer<typeof UserBadgeOutputSchema>;
