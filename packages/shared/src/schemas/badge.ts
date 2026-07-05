import { z } from 'zod';
import { BADGE_RULE_VALUES } from '../constants/index.ts';

const BadgeRuleEnum = z.enum(BADGE_RULE_VALUES);

/** Validates badge-creation payloads (name, icon, rule, threshold) for admin badge management. */
export const BadgeCreateSchema = z.object({
  name: z.string().min(1).max(100),
  icon: z.string().min(1).max(50),
  description: z.string().min(1).max(500),
  rule: BadgeRuleEnum,
  threshold: z.number().int().positive(),
});

/** Validates partial badge-update payloads (all BadgeCreateSchema fields optional). */
export const BadgeUpdateSchema = BadgeCreateSchema.partial();
