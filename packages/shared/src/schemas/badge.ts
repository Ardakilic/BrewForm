import { z } from 'zod';

const BadgeRuleEnum = z.enum([
  'first_brew', 'decade_brewer', 'centurion', 'first_fork',
  'fan_favourite', 'community_star', 'conversationalist',
  'precision_brewer', 'explorer', 'influencer',
]);

export const BadgeCreateSchema = z.object({
  name: z.string().min(1).max(100),
  icon: z.string().min(1).max(50),
  description: z.string().min(1).max(500),
  rule: BadgeRuleEnum,
  threshold: z.number().int().positive(),
});

export const BadgeUpdateSchema = BadgeCreateSchema.partial();