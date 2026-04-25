import { z } from 'zod';
import { PaginationSchema, UuidSchema } from './common.ts';

const BrewMethodEnum = z.enum([
  'espresso_machine', 'v60', 'french_press', 'aeropress',
  'turkish_coffee', 'drip_coffee', 'chemex', 'kalita_wave',
  'moka_pot', 'cold_brew', 'siphon',
]);

const DrinkTypeEnum = z.enum([
  'espresso', 'americano', 'flat_white', 'latte',
  'cappuccino', 'cortado', 'macchiato', 'turkish_coffee',
  'pour_over', 'cold_brew', 'french_press',
]);

const VisibilityEnum = z.enum(['draft', 'private', 'unlisted', 'public']);

export const SearchSchema = PaginationSchema.extend({
  q: z.string().optional(),
  brewMethod: BrewMethodEnum.optional(),
  drinkType: DrinkTypeEnum.optional(),
  visibility: VisibilityEnum.optional(),
  authorId: UuidSchema.optional(),
  grinder: z.string().optional(),
  sortBy: z.enum(['createdAt', 'likeCount', 'rating']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});