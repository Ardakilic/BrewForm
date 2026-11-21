import { z } from 'zod';
import {
  ADDITIONAL_PREPARATION_TYPE_VALUES,
  BREW_METHOD_VALUES,
  DRINK_TYPE_VALUES,
  EMOJI_TAG_VALUES,
  VISIBILITY_VALUES,
} from '../constants/index.ts';

const BrewMethodEnum = z.enum(BREW_METHOD_VALUES);
const DrinkTypeEnum = z.enum(DRINK_TYPE_VALUES);
const VisibilityEnum = z.enum(VISIBILITY_VALUES);
const EmojiTagEnum = z.enum(EMOJI_TAG_VALUES);
const AdditionalPreparationTypeEnum = z.enum(ADDITIONAL_PREPARATION_TYPE_VALUES);

const AdditionalPreparationSchema = z.object({
  name: z.string().min(1).max(100),
  type: AdditionalPreparationTypeEnum,
  inputAmount: z.string().min(1).max(50),
  preparationType: z.string().min(1).max(100),
});

/**
 * A list of relation ids (taste notes, equipment) with no repeated id. A duplicate would
 * violate the `(recipe_version_id, <relation>_id)` unique constraint of the join table, so it
 * is rejected up front with a field-level 400 instead of a 409 from the database.
 */
const RelationIdsSchema = z.array(z.uuid()).refine((ids) => new Set(ids).size === ids.length, {
  message: 'Duplicate ids are not allowed',
});

/**
 * Field validators shared by the create and update object schemas, without optionality or
 * defaults. Each schema decides per field whether it is required, `.optional()` (create) or
 * `.nullish()` (update), so a `.default()` can never leak from create into update.
 */
const recipeFields = {
  title: z.string().min(1).max(200),
  visibility: VisibilityEnum,
  productName: z.string().max(200),
  coffeeBrand: z.string().max(200),
  coffeeProcessing: z.string().max(200),
  vendorId: z.uuid(),
  roastDate: z.iso.date(),
  packageOpenDate: z.iso.date(),
  grindDate: z.iso.date(),
  brewDate: z.iso.date(),
  brewMethod: BrewMethodEnum,
  drinkType: DrinkTypeEnum,
  brewerDetails: z.string().max(200),
  grinder: z.string().max(200),
  grindSize: z.string().max(100),
  groundWeightGrams: z.number().min(0),
  extractionTimeSeconds: z.number().positive(),
  extractionVolumeMl: z.number().min(0),
  temperatureCelsius: z.number().min(-40).max(100),
  tds: z.number().min(0).max(25),
  personalNotes: z.string().max(10000),
  preparationNotes: z.string().min(1).max(10000),
  isFavourite: z.boolean(),
  rating: z.number().min(1).max(10),
  emojiTag: EmojiTagEnum,
  setupId: z.uuid(),
  tasteNoteIds: RelationIdsSchema,
  equipmentIds: RelationIdsSchema,
  additionalPreparations: z.array(AdditionalPreparationSchema),
  preInfusionTimeSeconds: z.number().int().min(1),
  beanId: z.uuid(),
  coffeeVarietyId: z.uuid(),
  tasteNoteIntensities: z.record(z.uuid(), z.number().int().min(1).max(3)),
};

/**
 * Base recipe-creation payload object (no cross-field refinements); building block for
 * {@link RecipeCreateSchema}.
 *
 * `brewRatio` and `flowRate` are not accepted: the API derives them from the measurements, and
 * unknown keys are stripped, so older clients that still send them keep working.
 * `coffeeVarietyId` links the version to a catalogue variety; the API copies the variety's
 * name server-side (`coffeeVarietyName` is never accepted from clients).
 */
export const RecipeCreateObjectSchema = z.object({
  title: recipeFields.title,
  visibility: recipeFields.visibility.default('draft'),
  productName: recipeFields.productName.optional(),
  coffeeBrand: recipeFields.coffeeBrand.optional(),
  coffeeProcessing: recipeFields.coffeeProcessing.optional(),
  vendorId: recipeFields.vendorId.optional(),
  roastDate: recipeFields.roastDate.optional(),
  packageOpenDate: recipeFields.packageOpenDate.optional(),
  grindDate: recipeFields.grindDate.optional(),
  brewDate: recipeFields.brewDate.optional(),
  brewMethod: recipeFields.brewMethod,
  drinkType: recipeFields.drinkType,
  brewerDetails: recipeFields.brewerDetails.optional(),
  grinder: recipeFields.grinder.optional(),
  grindSize: recipeFields.grindSize.optional(),
  groundWeightGrams: recipeFields.groundWeightGrams.optional(),
  extractionTimeSeconds: recipeFields.extractionTimeSeconds.optional(),
  extractionVolumeMl: recipeFields.extractionVolumeMl.optional(),
  temperatureCelsius: recipeFields.temperatureCelsius.optional(),
  tds: recipeFields.tds.optional().nullable(),
  personalNotes: recipeFields.personalNotes.optional(),
  preparationNotes: recipeFields.preparationNotes,
  isFavourite: recipeFields.isFavourite.default(false),
  rating: recipeFields.rating.optional(),
  emojiTag: recipeFields.emojiTag.optional(),
  setupId: recipeFields.setupId.optional(),
  tasteNoteIds: recipeFields.tasteNoteIds.optional(),
  equipmentIds: recipeFields.equipmentIds.optional(),
  additionalPreparations: recipeFields.additionalPreparations.optional(),
  preInfusionTimeSeconds: recipeFields.preInfusionTimeSeconds.optional(),
  beanId: recipeFields.beanId.optional(),
  coffeeVarietyId: recipeFields.coffeeVarietyId.optional(),
  tasteNoteIntensities: recipeFields.tasteNoteIntensities.optional(),
});

/**
 * The values {@link recipeCrossFieldIssues} inspects. Dates are ISO `YYYY-MM-DD` strings (the
 * wire format), so they compare correctly as strings. `undefined` means "absent", `null` means
 * "explicitly empty".
 */
export interface RecipeCrossFieldValues {
  roastDate?: string | null;
  packageOpenDate?: string | null;
  grindDate?: string | null;
  preInfusionTimeSeconds?: number | null;
  extractionTimeSeconds?: number | null;
}

/** One cross-field violation: the offending field and the client-facing message. */
export interface RecipeCrossFieldIssue {
  field: keyof RecipeCrossFieldValues;
  message: string;
}

/**
 * The five cross-field recipe rules, defined once for the create schema, the update schema and
 * the API's check of an update merged over the stored current version:
 *
 * 1. grind date not before roast date (`grindDate`);
 * 2. package-open date not before roast date (`packageOpenDate`);
 * 3. grind date not before package-open date (`grindDate`);
 * 4. pre-infusion shorter than extraction (`preInfusionTimeSeconds`);
 * 5. extraction time required with pre-infusion (`preInfusionTimeSeconds`).
 *
 * Rules 1-4 apply only when both values are set. Rule 5 depends on `mode`:
 * - `'complete'` (default): `data` is the whole record (a create payload, or an update merged
 *   over the stored version), so a missing extraction time violates the rule.
 * - `'partial'`: `data` is an update payload, where an absent key keeps the stored value that
 *   only the API can see; rule 5 fires only when the payload explicitly clears the extraction
 *   time (`null`) while setting a pre-infusion time. The API re-runs the rules in `'complete'`
 *   mode on the merged values.
 *
 * Pure function, no I/O.
 *
 * @param data - The values to check.
 * @param mode - `'complete'` for whole records, `'partial'` for update payloads.
 * @returns Every violation, in rule order; empty when the values are consistent.
 */
export function recipeCrossFieldIssues(
  data: RecipeCrossFieldValues,
  mode: 'complete' | 'partial' = 'complete',
): RecipeCrossFieldIssue[] {
  const issues: RecipeCrossFieldIssue[] = [];
  const { roastDate, packageOpenDate, grindDate, preInfusionTimeSeconds, extractionTimeSeconds } =
    data;

  if (grindDate && roastDate && grindDate < roastDate) {
    issues.push({ field: 'grindDate', message: 'Grind date cannot be earlier than roast date' });
  }
  if (packageOpenDate && roastDate && packageOpenDate < roastDate) {
    issues.push({
      field: 'packageOpenDate',
      message: 'Package open date cannot be earlier than roast date',
    });
  }
  if (grindDate && packageOpenDate && grindDate < packageOpenDate) {
    issues.push({
      field: 'grindDate',
      message: 'Grind date cannot be earlier than package open date',
    });
  }
  if (
    preInfusionTimeSeconds != null &&
    extractionTimeSeconds != null &&
    preInfusionTimeSeconds >= extractionTimeSeconds
  ) {
    issues.push({
      field: 'preInfusionTimeSeconds',
      message: 'Pre-infusion time must be less than extraction time',
    });
  }
  const extractionMissing =
    mode === 'partial' ? extractionTimeSeconds === null : extractionTimeSeconds == null;
  if (preInfusionTimeSeconds != null && extractionMissing) {
    issues.push({
      field: 'preInfusionTimeSeconds',
      message: 'Extraction time is required when pre-infusion time is specified',
    });
  }
  return issues;
}

/**
 * Validates recipe-creation payloads: {@link RecipeCreateObjectSchema} plus the cross-field
 * rules of {@link recipeCrossFieldIssues} (same messages and paths as before the extraction).
 * Used by POST /api/v1/recipes.
 */
export const RecipeCreateSchema = RecipeCreateObjectSchema.superRefine((data, ctx) => {
  for (const issue of recipeCrossFieldIssues(data)) {
    ctx.addIssue({ code: 'custom', path: [issue.field], message: issue.message });
  }
});

/**
 * Recipe-update payload object, declared field by field with NO `.default()`: Zod 4 keeps a
 * `.default()` through `.optional()`/`.partial()`, so deriving this from
 * {@link RecipeCreateObjectSchema} would inject `visibility: 'draft'` and `isFavourite: false`
 * into every PATCH (the bug that unpublished recipes). Follows `UserPreferencesPatchSchema`.
 *
 * Semantics, decided by key presence in the parsed payload:
 * - an absent key keeps the stored value;
 * - `null` clears a clearable field (`productName`, `coffeeBrand`, `coffeeProcessing`,
 *   `vendorId`, the three dates, `brewerDetails`, `grinder`, `grindSize`, the measurements,
 *   `tds`, `preInfusionTimeSeconds`, `beanId`, `coffeeVarietyId`, `personalNotes`, `rating`,
 *   `emojiTag`);
 * - `null` is rejected for `title`, `visibility`, `brewMethod`, `drinkType`, `preparationNotes`,
 *   `isFavourite`, `brewDate`, `setupId` and the relation arrays;
 * - relation arrays (`tasteNoteIds`, `equipmentIds`, `additionalPreparations`): absent keeps,
 *   `[]` removes every row, a non-empty array replaces the rows.
 */
export const RecipeUpdateObjectSchema = z.object({
  title: recipeFields.title.optional(),
  visibility: recipeFields.visibility.optional(),
  productName: recipeFields.productName.nullish(),
  coffeeBrand: recipeFields.coffeeBrand.nullish(),
  coffeeProcessing: recipeFields.coffeeProcessing.nullish(),
  vendorId: recipeFields.vendorId.nullish(),
  roastDate: recipeFields.roastDate.nullish(),
  packageOpenDate: recipeFields.packageOpenDate.nullish(),
  grindDate: recipeFields.grindDate.nullish(),
  brewDate: recipeFields.brewDate.optional(),
  brewMethod: recipeFields.brewMethod.optional(),
  drinkType: recipeFields.drinkType.optional(),
  brewerDetails: recipeFields.brewerDetails.nullish(),
  grinder: recipeFields.grinder.nullish(),
  grindSize: recipeFields.grindSize.nullish(),
  groundWeightGrams: recipeFields.groundWeightGrams.nullish(),
  extractionTimeSeconds: recipeFields.extractionTimeSeconds.nullish(),
  extractionVolumeMl: recipeFields.extractionVolumeMl.nullish(),
  temperatureCelsius: recipeFields.temperatureCelsius.nullish(),
  tds: recipeFields.tds.nullish(),
  personalNotes: recipeFields.personalNotes.nullish(),
  preparationNotes: recipeFields.preparationNotes.optional(),
  isFavourite: recipeFields.isFavourite.optional(),
  rating: recipeFields.rating.nullish(),
  emojiTag: recipeFields.emojiTag.nullish(),
  setupId: recipeFields.setupId.optional(),
  tasteNoteIds: recipeFields.tasteNoteIds.optional(),
  equipmentIds: recipeFields.equipmentIds.optional(),
  additionalPreparations: recipeFields.additionalPreparations.optional(),
  preInfusionTimeSeconds: recipeFields.preInfusionTimeSeconds.nullish(),
  beanId: recipeFields.beanId.nullish(),
  coffeeVarietyId: recipeFields.coffeeVarietyId.nullish(),
  tasteNoteIntensities: recipeFields.tasteNoteIntensities.optional(),
});

/**
 * Validates recipe-update payloads: {@link RecipeUpdateObjectSchema} plus `bumpVersion`
 * (default `false`, the ONLY default in the update schema), the cross-field rules in
 * `'partial'` mode, and "`tasteNoteIntensities` requires `tasteNoteIds`".
 * `RecipeUpdateSchema.parse({})` is exactly `{ bumpVersion: false }`.
 *
 * `bumpVersion: false` amends the current version in place; `true` creates a new version that
 * carries forward every value and relation the payload does not provide.
 * Used by PATCH /api/v1/recipes/:id.
 */
export const RecipeUpdateSchema = RecipeUpdateObjectSchema.extend({
  bumpVersion: z.boolean().default(false),
}).superRefine((data, ctx) => {
  for (const issue of recipeCrossFieldIssues(data, 'partial')) {
    ctx.addIssue({ code: 'custom', path: [issue.field], message: issue.message });
  }
  if (data.tasteNoteIntensities !== undefined && data.tasteNoteIds === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['tasteNoteIntensities'],
      message: 'tasteNoteIntensities requires tasteNoteIds',
    });
  }
});

/**
 * Validates recipe list/feed query params (filters, search, pagination, cursor, sorting).
 * Used by GET /api/v1/recipes and GET /api/v1/recipes/starred.
 */
export const RecipeFilterSchema = z.object({
  brewMethod: BrewMethodEnum.optional(),
  drinkType: DrinkTypeEnum.optional(),
  visibility: VisibilityEnum.optional(),
  authorId: z.uuid().optional(),
  equipmentId: z.uuid().optional(),
  tasteNoteIds: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val) return true;
        const ids = val.split(',');
        if (ids.length > 10) return false;
        return ids.every((id) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim()),
        );
      },
      { message: 'tasteNoteIds must be at most 10 comma-separated UUIDs' },
    ),
  /**
   * Deprecated single-taste-note UUID filter. Use the plural `tasteNoteIds`
   * (comma-separated, AND logic, max 10) instead. The API still applies this
   * filter when set, but every response emits an RFC 8594 `Deprecation: true`
   * header and a `warn` log line. Tracked by OpenSpec change
   * `d28-remove-deprecated-taste-note-id`; the field itself will be removed
   * in a follow-up change (D29 or later) once production telemetry confirms
   * no significant callers remain.
   *
   * @deprecated Use `tasteNoteIds` instead. See D28.
   */
  tasteNoteId: z.uuid().optional().meta({ deprecated: true }),
  mainBrewer: z.string().max(200).optional(),
  coffeeVarietyId: z.uuid().optional(),
  search: z.string().optional(),
  /**
   * Author username or displayName substring filter (case-insensitive ilike).
   * Unlike `authorId` (exact UUID match), this is a free-text search on the
   * author's username or displayName. NEW in F11.
   */
  author: z.string().max(100).optional(),
  /**
   * Filter to recipes created on or after this date (inclusive).
   * Coerced from ISO 8601 date string. NEW in F11.
   */
  dateFrom: z.coerce.date().optional(),
  /**
   * Filter to recipes created on or before this date (inclusive).
   * Coerced from ISO 8601 date string. NEW in F11.
   */
  dateTo: z.coerce.date().optional(),
  /**
   * Minimum average rating (1-10 inclusive). Recipes with zero ratings
   * are excluded (NULL average fails gte). NEW in F11.
   */
  minRating: z.coerce.number().int().min(1).max(10).optional(),
  /**
   * Maximum average rating (1-10 inclusive). NEW in F11.
   */
  maxRating: z.coerce.number().int().min(1).max(10).optional(),
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.enum(['createdAt', 'likeCount', 'rating']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  cursor: z.string().optional(),
  includeTotal: z.preprocess((val) => {
    if (val === true || val === 'true' || val === '1' || val === 'yes') return true;
    if (val === false || val === 'false' || val === '0' || val === 'no') return false;
    return val;
  }, z.boolean().optional().default(false)),
});

/**
 * Validates recipe rating payloads (1–10).
 * Used by POST /api/v1/recipes/:id/rate.
 */
export const RecipeRateSchema = z.object({
  rating: z.number().int().min(1).max(10),
});

/**
 * Validates the caller's private recipe note payload: trimmed, 1–10,000 characters.
 * Used by `PUT /api/v1/recipes/:id/notes`, which creates or replaces only the
 * authenticated caller's own note (`user_recipe_note`); it never touches the
 * author's public brewer notes (`recipe_version.personal_notes`).
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

export const RecipeMergeSchema = z
  .object({
    recipeVersionId1: z.uuid(),
    recipeVersionId2: z.uuid(),
    title: z.string().min(1).max(200),
    selections: z
      .object({
        brewMethod: z.enum(['v1', 'v2']).optional(),
        drinkType: z.enum(['v1', 'v2']).optional(),
        grindSize: z.enum(['v1', 'v2']).optional(),
        groundWeightGrams: z.enum(['v1', 'v2']).optional(),
        extractionTimeSeconds: z.enum(['v1', 'v2']).optional(),
        extractionVolumeMl: z.enum(['v1', 'v2']).optional(),
        temperatureCelsius: z.enum(['v1', 'v2']).optional(),
        brewerDetails: z.enum(['v1', 'v2']).optional(),
        grinder: z.enum(['v1', 'v2']).optional(),
        preparationNotes: z.enum(['v1', 'v2']).optional(),
        personalNotes: z.enum(['v1', 'v2']).optional(),
        tasteNotes: z.enum(['v1', 'v2', 'both', 'none']).optional(),
        equipment: z.enum(['v1', 'v2', 'both', 'none']).optional(),
        additionalPreparations: z.enum(['v1', 'v2', 'both', 'none']).optional(),
      })
      .default({}),
  })
  .refine((data) => data.recipeVersionId1 !== data.recipeVersionId2, {
    message: 'Cannot merge a version with itself',
    path: ['recipeVersionId2'],
  });

/** Inferred type of {@link RecipeCreateSchema}. */
export type RecipeCreate = z.infer<typeof RecipeCreateSchema>;
/** Inferred type of {@link RecipeUpdateSchema}. */
export type RecipeUpdate = z.infer<typeof RecipeUpdateSchema>;
/** Inferred type of {@link RecipeForkSchema}. */
export type RecipeFork = z.infer<typeof RecipeForkSchema>;
/** Inferred type of {@link RecipeRateSchema}. */
export type RecipeRate = z.infer<typeof RecipeRateSchema>;
/** Inferred type of {@link RecipeNotesSchema}. */
export type RecipeNotes = z.infer<typeof RecipeNotesSchema>;
/** Inferred type of {@link RecipeMergeSchema}. */
export type RecipeMerge = z.infer<typeof RecipeMergeSchema>;
