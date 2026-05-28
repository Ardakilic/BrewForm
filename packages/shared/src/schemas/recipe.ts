import { z } from 'zod';

const BrewMethodEnum = z.enum([
  'espresso_machine',
  'v60',
  'french_press',
  'aeropress',
  'turkish_coffee',
  'drip_coffee',
  'chemex',
  'kalita_wave',
  'moka_pot',
  'cold_brew',
  'siphon',
]);

const DrinkTypeEnum = z.enum([
  'espresso',
  'americano',
  'flat_white',
  'latte',
  'cappuccino',
  'cortado',
  'macchiato',
  'turkish_coffee',
  'pour_over',
  'cold_brew',
  'french_press',
  'aeropress',
  'drip_coffee',
  'moka_pot',
  'siphon',
]);

const VisibilityEnum = z.enum(['draft', 'private', 'unlisted', 'public']);
const EmojiTagEnum = z.enum(['fire', 'rocket', 'thumbsup', 'neutral', 'thumbsdown', 'nauseated']);

const AdditionalPreparationTypeEnum = z.enum(['milk', 'water', 'syrup', 'spice', 'other']);

const AdditionalPreparationSchema = z.object({
  name: z.string().min(1).max(100),
  type: AdditionalPreparationTypeEnum,
  inputAmount: z.string().min(1).max(50),
  preparationType: z.string().min(1).max(100),
});

export const RecipeCreateObjectSchema = z.object({
  title: z.string().min(1).max(200),
  visibility: VisibilityEnum.default('draft'),
  productName: z.string().max(200).optional(),
  coffeeBrand: z.string().max(200).optional(),
  coffeeProcessing: z.string().max(200).optional(),
  vendorId: z.uuid().optional(),
  roastDate: z.iso.date().optional(),
  packageOpenDate: z.iso.date().optional(),
  grindDate: z.iso.date().optional(),
  brewDate: z.iso.date().optional(),
  brewMethod: BrewMethodEnum,
  drinkType: DrinkTypeEnum,
  brewerDetails: z.string().max(200).optional(),
  grinder: z.string().max(200).optional(),
  grindSize: z.string().max(100).optional(),
  groundWeightGrams: z.number().min(0).optional(),
  extractionTimeSeconds: z.number().positive().optional(),
  extractionVolumeMl: z.number().min(0).optional(),
  temperatureCelsius: z.number().min(-40).max(100).optional(),
  tds: z.number().min(0).max(25).optional().nullable(),
  personalNotes: z.string().max(10000).optional(),
  preparationNotes: z.string().min(1).max(10000),
  isFavourite: z.boolean().default(false),
  rating: z.number().min(1).max(10).optional(),
  emojiTag: EmojiTagEnum.optional(),
  setupId: z.uuid().optional(),
  tasteNoteIds: z.array(z.uuid()).optional(),
  equipmentIds: z.array(z.uuid()).optional(),
  additionalPreparations: z.array(AdditionalPreparationSchema).optional(),
  preInfusionTimeSeconds: z.number().int().min(1).optional(),
  beanId: z.uuid().optional(),
  brewRatio: z.number().min(0).optional(),
  flowRate: z.number().min(0).optional(),
  tasteNoteIntensities: z.record(z.uuid(), z.number().int().min(1).max(3)).optional(),
});

export const RecipeCreateSchema = RecipeCreateObjectSchema
  .refine(
    (data) => {
      if (data.grindDate && data.roastDate) {
        return data.grindDate >= data.roastDate;
      }
      return true;
    },
    { message: 'Grind date cannot be earlier than roast date', path: ['grindDate'] },
  )
  .refine(
    (data) => {
      if (data.packageOpenDate && data.roastDate) {
        return data.packageOpenDate >= data.roastDate;
      }
      return true;
    },
    { message: 'Package open date cannot be earlier than roast date', path: ['packageOpenDate'] },
  )
  .refine(
    (data) => {
      if (data.grindDate && data.packageOpenDate) {
        return data.grindDate >= data.packageOpenDate;
      }
      return true;
    },
    { message: 'Grind date cannot be earlier than package open date', path: ['grindDate'] },
  )
  .refine(
    (data) => {
      if (data.preInfusionTimeSeconds != null && data.extractionTimeSeconds != null) {
        return data.preInfusionTimeSeconds < data.extractionTimeSeconds;
      }
      return true;
    },
    {
      message: 'Pre-infusion time must be less than extraction time',
      path: ['preInfusionTimeSeconds'],
    },
  )
  .refine(
    (data) => {
      if (data.preInfusionTimeSeconds != null && data.extractionTimeSeconds == null) {
        return false;
      }
      return true;
    },
    {
      message: 'Extraction time is required when pre-infusion time is specified',
      path: ['preInfusionTimeSeconds'],
    },
  );

export const RecipeUpdateSchema = RecipeCreateObjectSchema.partial().extend({
  bumpVersion: z.boolean().default(false),
});

export const RecipeFilterSchema = z.object({
  brewMethod: BrewMethodEnum.optional(),
  drinkType: DrinkTypeEnum.optional(),
  visibility: VisibilityEnum.optional(),
  authorId: z.uuid().optional(),
  equipmentId: z.uuid().optional(),
  tasteNoteIds: z.string().optional().refine(
    (val) => {
      if (!val) return true;
      const ids = val.split(',');
      if (ids.length > 10) return false;
      return ids.every((id) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim())
      );
    },
    { message: 'tasteNoteIds must be at most 10 comma-separated UUIDs' },
  ),
  // Keep tasteNoteId for backward compatibility (deprecated)
  tasteNoteId: z.uuid().optional(),
  grinder: z.string().optional(),
  mainBrewer: z.string().max(200).optional(),
  coffeeVarietyId: z.uuid().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.enum(['createdAt', 'likeCount', 'rating']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * Validates recipe rating payloads (1–10).
 * Used by POST /api/v1/recipes/:id/rate.
 */
export const RecipeRateSchema = z.object({
  rating: z.number().int().min(1).max(10),
});

/**
 * Validates personal recipe notes payloads.
 * Used by POST /api/v1/recipes/:id/notes.
 */
export const RecipeNotesSchema = z.object({
  notes: z.string().trim().min(1).max(10000),
});

/**
 * Validates recipe fork payloads.
 * Used by POST /api/v1/recipes/:id/fork.
 */
export const RecipeForkSchema = z.object({
  title: z.string().max(200).optional(),
});
