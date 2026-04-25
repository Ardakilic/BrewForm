import { z } from 'zod';

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
const EmojiTagEnum = z.enum(['fire', 'rocket', 'thumbsup', 'neutral', 'thumbsdown', 'sick']);

const AdditionalPreparationSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.string().min(1).max(100),
  inputAmount: z.string().min(1).max(50),
  preparationType: z.string().min(1).max(100),
});

const RecipeCreateObjectSchema = z.object({
  title: z.string().min(1).max(200),
  visibility: VisibilityEnum.default('draft'),
  productName: z.string().max(200).optional(),
  coffeeBrand: z.string().max(200).optional(),
  coffeeProcessing: z.string().max(200).optional(),
  vendorId: z.string().uuid().optional(),
  roastDate: z.string().date().optional(),
  packageOpenDate: z.string().date().optional(),
  grindDate: z.string().date().optional(),
  brewDate: z.string().date().optional(),
  brewMethod: BrewMethodEnum,
  drinkType: DrinkTypeEnum,
  brewerDetails: z.string().max(200).optional(),
  grinder: z.string().max(200).optional(),
  grindSize: z.string().max(100).optional(),
  groundWeightGrams: z.number().positive().optional(),
  extractionTimeSeconds: z.number().positive().optional(),
  extractionVolumeMl: z.number().positive().optional(),
  temperatureCelsius: z.number().min(-40).max(100).optional(),
  personalNotes: z.string().max(10000).optional(),
  isFavourite: z.boolean().default(false),
  rating: z.number().min(1).max(10).optional(),
  emojiTag: EmojiTagEnum.optional(),
  setupId: z.string().uuid().optional(),
  tasteNoteIds: z.array(z.string().uuid()).optional(),
  equipmentIds: z.array(z.string().uuid()).optional(),
  additionalPreparations: z.array(AdditionalPreparationSchema).optional(),
});

export const RecipeCreateSchema = RecipeCreateObjectSchema.refine(
  (data) => {
    if (data.grindDate && data.roastDate) {
      return data.grindDate >= data.roastDate;
    }
    return true;
  },
  { message: 'Grind date cannot be earlier than roast date', path: ['grindDate'] },
);

export const RecipeUpdateSchema = RecipeCreateObjectSchema.partial().extend({
  bumpVersion: z.boolean().default(false),
});

export const RecipeFilterSchema = z.object({
  brewMethod: BrewMethodEnum.optional(),
  drinkType: DrinkTypeEnum.optional(),
  visibility: VisibilityEnum.optional(),
  authorId: z.string().uuid().optional(),
  grinder: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.enum(['createdAt', 'likeCount', 'rating']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});