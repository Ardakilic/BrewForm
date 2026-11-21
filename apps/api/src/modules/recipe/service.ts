/**
 * Recipe business-logic / service layer.
 *
 * Sits between controllers and the data-access layer ({@link ./model.ts}).
 * Orchestrates multi-step operations (creation, version bumping, forking),
 * enforces business rules (equipment compatibility, visibility checks),
 * and triggers side effects (badge evaluation, follower notifications).
 *
 * All DB access is delegated to `model.ts` — no Drizzle calls from this module.
 */

import {
  type RecipeCreateSchema,
  type RecipeFilterSchema,
  type RecipeMerge,
  type RecipeUpdateSchema,
  recipeCrossFieldIssues,
} from '@brewform/shared/schemas';
import type { BrewMethod } from '@brewform/shared/types';
import {
  computeBrewRatio,
  computeFlowRate,
  decodeCursor,
  randomSlugSuffix,
  SLUG_SUFFIX_ATTEMPTS,
  slugCandidates,
} from '@brewform/shared/utils';
import type { z } from 'zod';
import {
  ConflictError,
  type ErrorDetail,
  isStatementTimeout,
  ValidationError,
} from '../../utils/errors.ts';
import { createLogger } from '../../utils/logger/index.ts';
import { notifyFollowersOfNewRecipe } from '../../utils/notify/index.ts';
import { sanitizeText } from '../../utils/sanitize.ts';
import { evaluateBadges } from '../badge/service.ts';
import { createLikeNotification } from '../notification/service.ts';
import * as model from './model.ts';

/** Type alias for the result returned by model.findById / model.findBySlug (rich relational query). */
type RecipeWithRelations = NonNullable<Awaited<ReturnType<typeof model.findById>>> | undefined;

/**
 * Augmented recipe-create input. Extends the Zod-inferred shape with
 * `photoIds` which the controller layer may supply when linking existing
 * uploads during creation.
 */
type RecipeCreateInput = z.infer<typeof RecipeCreateSchema> & {
  photoIds?: string[];
};

/**
 * Augmented recipe-update input. Extends the Zod-inferred `RecipeUpdateSchema`
 * shape (every field optional, clearable fields nullable, plus `bumpVersion`)
 * with the same `photoIds` field the create path supports. An `undefined` key
 * means "keep", `null` means "clear", `[]` means "remove all".
 */
type RecipeUpdateInput = z.infer<typeof RecipeUpdateSchema> & {
  photoIds?: string[];
};

/** Module-scoped structured logger (exported for test spies). */
export const logger = createLogger('recipe-service');

/**
 * Build the ordered slug candidates for a (sanitized) title: the bare base when it is usable,
 * then `<base>-<suffix>` for {@link SLUG_SUFFIX_ATTEMPTS} fresh random suffixes. No pre-check
 * query runs; the model claims the first free candidate inside the creation transaction.
 * `randomSlugSuffix` is imported from `@brewform/shared/utils` so tests can replace it via `vi.mock`.
 *
 * @param title - The sanitized recipe title.
 * @returns At most `1 + SLUG_SUFFIX_ATTEMPTS` distinct candidates.
 */
function buildRecipeSlugCandidates(title: string): string[] {
  return slugCandidates(
    title,
    Array.from({ length: SLUG_SUFFIX_ATTEMPTS }, () => randomSlugSuffix()),
  );
}

/**
 * Log and build the `409 SLUG_CONFLICT` error for a create/fork whose slug candidates were all
 * taken (practically unreachable with 27^6 suffixes; reached by tests that pin the suffix).
 *
 * @param authorId - The author whose create/fork failed.
 * @param attempts - How many candidates were tried.
 */
function slugExhausted(authorId: string, attempts: number): ConflictError {
  logger.warn(
    { authorId, attempts, constraint: 'recipe_slug_unique' },
    'recipe slug candidates exhausted',
  );
  return new ConflictError('SLUG_CONFLICT', 'Could not allocate a unique recipe slug');
}

/** The `400 VALIDATION_ERROR` thrown when a title is empty after sanitization. */
function emptyTitleError(): ValidationError {
  return new ValidationError('Title cannot be empty', [
    { field: 'title', message: 'Title cannot be empty' },
  ]);
}

/** Referenced ids of a recipe write that must exist before anything is written. */
interface RecipeReferences {
  /** Taste notes to link (checked when provided). */
  tasteNoteIds?: string[];
  /** Equipment to link (checked when provided). */
  equipmentIds?: string[];
  /** Vendor to link (checked when non-null). */
  vendorId?: string | null;
  /** Coffee variety to link (checked when non-null; its name is resolved). */
  coffeeVarietyId?: string | null;
  /** Bean to link: a NEWLY set bean (checked against the author when non-null). */
  newBeanId?: string | null;
}

/**
 * Check that every referenced record exists (soft-deleted rows excluded) and that a newly set
 * bean belongs to the author, collecting one detail per failing field. Runs before any write,
 * so a bad reference is a field-level 400 instead of a foreign-key violation; the global
 * `23503 → 400` mapping stays the backstop.
 *
 * @param authorId - The recipe author (owner check for the bean).
 * @param refs - The ids to check.
 * @returns The resolved coffee-variety name (`null` when no variety is set).
 * @throws {ValidationError} `400 VALIDATION_ERROR` with a detail per invalid field.
 */
async function validateReferences(
  authorId: string,
  refs: RecipeReferences,
): Promise<{ coffeeVarietyName: string | null }> {
  const details: ErrorDetail[] = [];

  if (refs.tasteNoteIds?.length) {
    const existing = new Set(await model.findExistingTasteNoteIds(refs.tasteNoteIds));
    const missing = refs.tasteNoteIds.filter((id) => !existing.has(id));
    if (missing.length) {
      details.push({
        field: 'tasteNoteIds',
        message: `Unknown taste notes: ${missing.join(', ')}`,
      });
    }
  }
  if (refs.equipmentIds?.length) {
    const existing = new Set(await model.findExistingEquipmentIds(refs.equipmentIds));
    const missing = refs.equipmentIds.filter((id) => !existing.has(id));
    if (missing.length) {
      details.push({ field: 'equipmentIds', message: `Unknown equipment: ${missing.join(', ')}` });
    }
  }
  if (refs.vendorId && !(await model.findVendor(refs.vendorId))) {
    details.push({ field: 'vendorId', message: 'Vendor does not exist' });
  }
  let coffeeVarietyName: string | null = null;
  if (refs.coffeeVarietyId) {
    const variety = await model.findCoffeeVariety(refs.coffeeVarietyId);
    if (variety) coffeeVarietyName = variety.name;
    else details.push({ field: 'coffeeVarietyId', message: 'Coffee variety does not exist' });
  }
  if (refs.newBeanId && !(await model.findOwnedBean(refs.newBeanId, authorId))) {
    details.push({ field: 'beanId', message: 'Bean does not exist or is not yours' });
  }

  if (details.length) {
    logger.debug(
      { authorId, fields: details.map((d) => d.field) },
      'recipe write rejected: invalid references',
    );
    throw new ValidationError('Invalid references', details);
  }
  return { coffeeVarietyName };
}

/**
 * Throw a `400 VALIDATION_ERROR` when the values break a cross-field rule (date order,
 * pre-infusion vs extraction), with the same `field`/`message` details as the schemas.
 *
 * @param values - Complete values (a create payload or an update merged over the stored version).
 * @throws {ValidationError} When at least one rule is broken.
 */
function assertCrossFieldRules(values: Parameters<typeof recipeCrossFieldIssues>[0]): void {
  const issues = recipeCrossFieldIssues(values);
  if (issues.length) throw new ValidationError('Validation failed', issues);
}

/**
 * Format a stored timestamp as the `YYYY-MM-DD` day the payload schemas use (UTC), so stored
 * and submitted dates compare consistently in {@link recipeCrossFieldIssues}.
 *
 * @param date - A stored date, or `null`.
 */
function toIsoDay(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

/**
 * Merge one update value over the stored value: `undefined` (absent key) keeps the stored
 * value, anything else (including `null`, which clears) replaces it.
 *
 * @param value - The payload value.
 * @param stored - The stored value.
 */
function mergeValue<T>(value: T | null | undefined, stored: T | null): T | null {
  return value === undefined ? stored : value;
}

/**
 * Merge an update date (`YYYY-MM-DD`) over a stored timestamp: absent keeps, `null` clears,
 * a string replaces.
 *
 * @param value - The payload date.
 * @param stored - The stored timestamp.
 */
function mergeDate(value: string | null | undefined, stored: Date | null): Date | null {
  if (value === undefined) return stored;
  return value === null ? null : new Date(value);
}

/**
 * Store a TDS reading as the decimal string Drizzle's `numeric` column expects; Postgres rounds
 * it to two decimals.
 *
 * @param tds - The submitted reading.
 */
function tdsToDecimal(tds: number | null | undefined): string | null {
  return tds == null ? null : String(tds);
}

/**
 * Sanitize brewer notes (`recipe_version.personal_notes`); notes that are empty after
 * sanitization are stored as `NULL`.
 *
 * @param notes - The submitted notes.
 */
function sanitizeBrewerNotes(notes: string | null | undefined): string | null {
  return sanitizeText(notes) || null;
}

/**
 * Compute the derived `brewRatio`/`flowRate` from measurements (never accepted from clients).
 *
 * @param m - Ground weight, extraction volume and extraction time (any may be missing).
 */
function derivedMetrics(m: {
  groundWeightGrams?: number | null;
  extractionVolumeMl?: number | null;
  extractionTimeSeconds?: number | null;
}): { brewRatio: number | null; flowRate: number | null } {
  return {
    brewRatio:
      m.groundWeightGrams && m.extractionVolumeMl
        ? computeBrewRatio(m.groundWeightGrams, m.extractionVolumeMl)
        : null,
    flowRate:
      m.extractionVolumeMl && m.extractionTimeSeconds
        ? computeFlowRate(m.extractionVolumeMl, m.extractionTimeSeconds)
        : null,
  };
}

/** Retrieve a recipe by slug or UUID. Throws `RECIPE_NOT_FOUND` if neither matches. */
export async function getRecipe(slugOrId: string) {
  logger.debug({ slugOrId }, 'getRecipe started');
  let recipe: RecipeWithRelations;
  if (slugOrId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    recipe = (await model.findById(slugOrId)) ?? undefined;
  } else {
    recipe = (await model.findBySlug(slugOrId)) ?? undefined;
  }
  if (!recipe) throw new Error('RECIPE_NOT_FOUND');
  logger.debug({ slugOrId }, 'getRecipe completed');
  return recipe;
}

/** Lightweight shape used by `checkEquipmentCompatibility` to validate equipment items against brew method rules. */
export interface CompatibilityCheckItem {
  /** Equipment UUID from the `equipment` table. */
  id: string;
  /** Equipment category (e.g. `'pressurized_basket'`, `'paper_filter'`). */
  type: string;
}

/** Row shape from the `brewMethodEquipmentRules` DB table. */
export interface CompatibilityRule {
  /** Brew method key (e.g. `'espresso'`, `'pour_over'`). */
  brewMethod: BrewMethod;
  /** Equipment type this rule applies to. */
  equipmentType: string;
  /** Whether the equipment type is compatible with the brew method. */
  compatible: boolean;
}

/**
 * Validate that equipment items are compatible with a given brew method.
 *
 * Compatibility rules are defined in the `brewMethodEquipmentRules` DB table.
 * Each rule specifies whether an equipment type is allowed for a brew method
 * (e.g. espresso requires a pressurized brewer, prohibits French press).
 * Pure function — no I/O, suitable for both server and client use.
 *
 * @param equipmentItems - Equipment items to check (id + type per item).
 * @param brewMethod     - The brew method being validated against.
 * @param rules          - Full list of compatibility rules (fetched from DB).
 * @returns Array of human-readable incompatibility messages. Empty array means all compatible.
 */
export function checkEquipmentCompatibility(
  equipmentItems: CompatibilityCheckItem[],
  brewMethod: BrewMethod,
  rules: CompatibilityRule[],
): string[] {
  const incompatible: string[] = [];
  for (const eqItem of equipmentItems) {
    const rule = rules.find((r) => r.brewMethod === brewMethod && r.equipmentType === eqItem.type);
    if (rule && !rule.compatible) {
      incompatible.push(`${eqItem.type} is not compatible with ${brewMethod}`);
    }
  }
  return incompatible;
}

/** Validate equipment compatibility against the brew method's rules, throwing `EQUIPMENT_INCOMPATIBLE` on violation. */
async function validateEquipmentCompatibility(
  brewMethod: BrewMethod,
  equipmentIds: string[],
): Promise<void> {
  if (!brewMethod || !equipmentIds?.length) return;

  const equipmentList = await model.getEquipmentByIds(equipmentIds);
  const allRules = await model.getBrewMethodEquipmentRules(brewMethod);

  const incompatible = checkEquipmentCompatibility(
    equipmentList.map((e) => ({ id: e.id, type: e.type })),
    brewMethod,
    allRules,
  );

  if (incompatible.length) {
    throw Object.assign(new Error('EQUIPMENT_INCOMPATIBLE'), {
      code: 'EQUIPMENT_INCOMPATIBLE',
      details: incompatible,
    });
  }
}

/**
 * Create a new recipe with its first version and all related entities.
 *
 * Orchestration steps (every validation runs before the first write, so a rejected request
 * writes nothing):
 * 1. Validate referenced records (taste notes, equipment, vendor, coffee variety, and the
 *    author's own bean) and resolve the coffee-variety name server-side
 * 2. Validate equipment compatibility against the selected brew method
 * 3. Sanitize the title and build the slug candidates (bare base, then random
 *    suffixes; reserved, UUID-shaped and non-Latin bases are always suffixed)
 * 4. Inherit `grinder` and `brewerDetails` from the user's setup when `setupId`
 *    is provided (falling back to explicitly supplied values)
 * 5. Compute derived metrics (`brewRatio`, `flowRate`) from raw measurements, store `tds` as a
 *    decimal string and empty brewer notes as `NULL`
 * 6. Claim the first free slug and insert recipe, version, taste notes,
 *    equipment, additional preparations, and version photos inside a single
 *    transaction (concurrent creates with the same title get distinct slugs)
 * 7. If visibility is `'public'`, asynchronously notify the author's followers
 * 8. Asynchronously evaluate badge eligibility for the author
 *
 * @param authorId - UUID of the authenticated user creating the recipe.
 * @param data     - Creation payload (validated Zod schema from `@brewform/shared`).
 * @returns The complete recipe object with version, relations, and author summary.
 * @throws {ValidationError} `400 VALIDATION_ERROR` when the title is empty after sanitization
 *   or a referenced record does not exist.
 * @throws {ConflictError} `409 SLUG_CONFLICT` when every slug candidate is taken.
 */
export async function createRecipe(authorId: string, data: RecipeCreateInput) {
  logger.debug({ authorId }, 'createRecipe started');
  const { coffeeVarietyName } = await validateReferences(authorId, {
    tasteNoteIds: data.tasteNoteIds,
    equipmentIds: data.equipmentIds,
    vendorId: data.vendorId,
    coffeeVarietyId: data.coffeeVarietyId,
    newBeanId: data.beanId,
  });
  await validateEquipmentCompatibility(data.brewMethod, data.equipmentIds ?? []);

  const safeTitle = sanitizeText(data.title);
  if (!safeTitle.trim()) throw emptyTitleError();
  const candidates = buildRecipeSlugCandidates(safeTitle);

  let grinder: string | null | undefined = data.grinder;
  let brewerDetails: string | null | undefined = data.brewerDetails;
  if (data.setupId) {
    const setup = await model.getUserSetup(data.setupId, authorId);
    if (setup) {
      if (!grinder) grinder = setup.grinder;
      if (!brewerDetails) brewerDetails = setup.brewerDetails;
    }
  }

  const finalRecipe = await model.createRecipeWithRelations({
    authorId,
    slugCandidates: candidates,
    title: safeTitle,
    visibility: data.visibility || 'draft',
    productName: data.productName ?? null,
    coffeeBrand: data.coffeeBrand ?? null,
    coffeeProcessing: data.coffeeProcessing ?? null,
    vendorId: data.vendorId ?? null,
    roastDate: data.roastDate ? new Date(data.roastDate) : null,
    packageOpenDate: data.packageOpenDate ? new Date(data.packageOpenDate) : null,
    grindDate: data.grindDate ? new Date(data.grindDate) : null,
    brewDate: data.brewDate ? new Date(data.brewDate) : new Date(),
    brewMethod: data.brewMethod,
    drinkType: data.drinkType,
    brewerDetails: brewerDetails ?? null,
    grinder: grinder ?? null,
    grindSize: data.grindSize ?? null,
    groundWeightGrams: data.groundWeightGrams ?? null,
    extractionTimeSeconds: data.extractionTimeSeconds ?? null,
    extractionVolumeMl: data.extractionVolumeMl ?? null,
    temperatureCelsius: data.temperatureCelsius ?? null,
    tds: tdsToDecimal(data.tds),
    ...derivedMetrics(data),
    preInfusionTimeSeconds: data.preInfusionTimeSeconds ?? null,
    beanId: data.beanId ?? null,
    coffeeVarietyId: data.coffeeVarietyId ?? null,
    coffeeVarietyName,
    personalNotes: sanitizeBrewerNotes(data.personalNotes),
    preparationNotes: sanitizeText(data.preparationNotes),
    isFavourite: data.isFavourite || false,
    rating: data.rating ?? null,
    emojiTag: data.emojiTag ?? null,
    tasteNoteIds: data.tasteNoteIds,
    tasteNoteIntensities: data.tasteNoteIntensities,
    equipmentIds: data.equipmentIds,
    additionalPreparations: data.additionalPreparations,
    photoIds: data.photoIds,
  });
  if (finalRecipe === null) throw slugExhausted(authorId, candidates.length);

  if (finalRecipe?.visibility === 'public') {
    (async () => {
      const author = await model.getUserById(authorId);
      if (!author?.username) return;
      await notifyFollowersOfNewRecipe({
        authorId,
        authorUsername: author.username,
        recipeTitle: finalRecipe.title,
        recipeSlug: finalRecipe.slug,
      });
    })().catch((err) => logger.error({ err }, 'notifyFollowersOfNewRecipe failed'));
  }

  evaluateBadges(authorId).catch((err) => logger.error({ err }, 'evaluateBadges failed'));

  logger.debug({ authorId }, 'createRecipe completed');
  return finalRecipe;
}

/**
 * Update a recipe: amend its current version in place (`bumpVersion: false`) or create a new
 * version (`bumpVersion: true`). Earlier versions are never modified.
 *
 * Payload semantics (decided by key presence, never by comparing with a schema default): an
 * absent key keeps the stored value, `null` clears it, and a relation array replaces the rows
 * (`[]` removes them all). On a bump, every value and relation the payload does not provide is
 * carried forward from the current version (`isFavourite`, `tds`, the coffee variety, taste
 * notes with intensities, equipment, preparations and photos included), and `brewDate` is the
 * payload value or now; on an amend `brewDate` changes only when provided. An omitted
 * `visibility` keeps the recipe's visibility.
 *
 * Steps:
 * 1. Load the recipe and check the author.
 * 2. Merge the payload over the current version and recompute `brewRatio`/`flowRate`;
 *    `setupId` fills `grinder`/`brewerDetails` from the author's setup only when those keys
 *    are absent from the payload.
 * 3. Validate before any write: the cross-field rules on the merged values, the referenced
 *    records (a bean only when newly set), equipment compatibility on the merged brew method
 *    and equipment set (when either changes), and the sanitized title; normalize `tds` to a
 *    decimal string, store empty brewer notes as `NULL` and resolve `coffeeVarietyName`.
 * 4. Write everything in one transaction through {@link model.updateRecipeWithVersion}.
 *
 * Sends no notification (unchanged).
 *
 * @param recipeId - The recipe to update.
 * @param authorId - The authenticated caller (must be the author).
 * @param data - The validated update payload.
 * @returns The updated recipe in the `findById` shape.
 * @throws `RECIPE_NOT_FOUND` if the recipe does not exist.
 * @throws `FORBIDDEN` if the requesting user is not the recipe author.
 * @throws {ValidationError} `400 VALIDATION_ERROR` (with details) for an empty title, a
 *   cross-field violation on the merged values or an invalid reference.
 * @throws `EQUIPMENT_INCOMPATIBLE` (422) when the merged equipment does not fit the brew method.
 */
export async function updateRecipe(recipeId: string, authorId: string, data: RecipeUpdateInput) {
  const mode: model.RecipeWriteMode = data.bumpVersion ? 'bump' : 'amend';
  logger.debug({ recipeId, authorId, mode }, 'updateRecipe started');
  const recipe = await model.findById(recipeId);
  if (!recipe) throw new Error('RECIPE_NOT_FOUND');
  if (recipe.authorId !== authorId) throw new Error('FORBIDDEN');
  const current =
    recipe.versions.find((v) => v.id === recipe.currentVersionId) ?? recipe.versions[0];
  if (!current) throw new Error('RECIPE_NO_VERSIONS');

  // 2. Merge (absent keeps, null clears).
  let grinder = mergeValue(data.grinder, current.grinder);
  let brewerDetails = mergeValue(data.brewerDetails, current.brewerDetails);
  if (data.setupId) {
    const setup = await model.getUserSetup(data.setupId, authorId);
    if (setup) {
      if (data.grinder === undefined && setup.grinder) grinder = setup.grinder;
      if (data.brewerDetails === undefined && setup.brewerDetails) {
        brewerDetails = setup.brewerDetails;
      }
    }
  }
  const measurements = {
    groundWeightGrams: mergeValue(data.groundWeightGrams, current.groundWeightGrams),
    extractionTimeSeconds: mergeValue(data.extractionTimeSeconds, current.extractionTimeSeconds),
    extractionVolumeMl: mergeValue(data.extractionVolumeMl, current.extractionVolumeMl),
  };
  const roastDate = mergeDate(data.roastDate, current.roastDate);
  const packageOpenDate = mergeDate(data.packageOpenDate, current.packageOpenDate);
  const grindDate = mergeDate(data.grindDate, current.grindDate);
  const preInfusionTimeSeconds = mergeValue(
    data.preInfusionTimeSeconds,
    current.preInfusionTimeSeconds,
  );
  const brewMethod = data.brewMethod ?? current.brewMethod;
  const beanId = mergeValue(data.beanId, current.beanId);
  const coffeeVarietyId = mergeValue(data.coffeeVarietyId, current.coffeeVarietyId);

  // 3. Validate everything before the first write.
  assertCrossFieldRules({
    roastDate: toIsoDay(roastDate),
    packageOpenDate: toIsoDay(packageOpenDate),
    grindDate: toIsoDay(grindDate),
    preInfusionTimeSeconds,
    extractionTimeSeconds: measurements.extractionTimeSeconds,
  });
  const references = await validateReferences(authorId, {
    tasteNoteIds: data.tasteNoteIds,
    equipmentIds: data.equipmentIds,
    vendorId: data.vendorId,
    coffeeVarietyId: data.coffeeVarietyId,
    newBeanId: data.beanId !== undefined && data.beanId !== current.beanId ? data.beanId : null,
  });
  if (data.brewMethod !== undefined || data.equipmentIds !== undefined) {
    await validateEquipmentCompatibility(
      brewMethod,
      data.equipmentIds ?? current.equipment.map((e) => e.equipmentId),
    );
  }
  const title = data.title !== undefined ? sanitizeText(data.title) : recipe.title;
  if (!title.trim()) throw emptyTitleError();
  const coffeeVarietyName =
    data.coffeeVarietyId === undefined ? current.coffeeVarietyName : references.coffeeVarietyName;

  // 4. One transactional write.
  // A bump records a new brew (payload date or now); an amend keeps the stored date unless given.
  let brewDate = mode === 'bump' ? new Date() : current.brewDate;
  if (data.brewDate) brewDate = new Date(data.brewDate);
  const updated = await model.updateRecipeWithVersion({
    recipeId,
    authorId,
    mode,
    title,
    visibility: data.visibility ?? recipe.visibility,
    version: {
      productName: mergeValue(data.productName, current.productName),
      coffeeBrand: mergeValue(data.coffeeBrand, current.coffeeBrand),
      coffeeProcessing: mergeValue(data.coffeeProcessing, current.coffeeProcessing),
      vendorId: mergeValue(data.vendorId, current.vendorId),
      roastDate,
      packageOpenDate,
      grindDate,
      brewDate,
      brewMethod,
      drinkType: data.drinkType ?? current.drinkType,
      brewerDetails,
      grinder,
      grindSize: mergeValue(data.grindSize, current.grindSize),
      ...measurements,
      temperatureCelsius: mergeValue(data.temperatureCelsius, current.temperatureCelsius),
      tds: data.tds === undefined ? current.tds : tdsToDecimal(data.tds),
      ...derivedMetrics(measurements),
      preInfusionTimeSeconds,
      beanId,
      coffeeVarietyId,
      coffeeVarietyName: coffeeVarietyId === null ? null : coffeeVarietyName,
      personalNotes:
        data.personalNotes === undefined
          ? current.personalNotes
          : sanitizeBrewerNotes(data.personalNotes),
      preparationNotes:
        data.preparationNotes === undefined
          ? current.preparationNotes
          : sanitizeText(data.preparationNotes),
      isFavourite: data.isFavourite ?? current.isFavourite,
      rating: mergeValue(data.rating, current.rating),
      emojiTag: mergeValue(data.emojiTag, current.emojiTag),
    },
    tasteNoteIds: data.tasteNoteIds,
    tasteNoteIntensities: data.tasteNoteIntensities,
    equipmentIds: data.equipmentIds,
    additionalPreparations: data.additionalPreparations,
    photoIds: data.photoIds,
  });

  const versionNumber = updated?.versions.find(
    (v) => v.id === updated.currentVersionId,
  )?.versionNumber;
  logger.debug({ recipeId, authorId, mode, versionNumber }, 'updateRecipe completed');
  return updated;
}

/** Soft-delete a recipe. Throws `RECIPE_NOT_FOUND` or `FORBIDDEN` on failure. */
export async function deleteRecipe(recipeId: string, authorId: string) {
  logger.debug({ recipeId, authorId }, 'deleteRecipe started');
  const recipe = await model.findById(recipeId);
  if (!recipe) throw new Error('RECIPE_NOT_FOUND');
  if (recipe.authorId !== authorId) throw new Error('FORBIDDEN');
  await model.softDelete(recipeId);
  logger.debug({ recipeId, authorId }, 'deleteRecipe completed');
}

/**
 * Fork an existing recipe into the caller's account.
 *
 * Only public/unlisted recipes can be freely forked; draft/private recipes
 * require the caller to be the original author. The supplied title is
 * sanitized with `sanitizeText` (like `createRecipe`) and falls back to
 * `"Fork of <original title>"` when absent or empty after sanitization. The
 * fork's slug goes through the same pipeline as creation (candidates claimed
 * inside the fork transaction), so a recipe can be forked any number of times.
 * Badge eligibility is re-evaluated for the forking user after creation.
 *
 * @param sourceId - UUID of the recipe to fork.
 * @param authorId - UUID of the user performing the fork.
 * @param title    - Optional custom title for the forked recipe.
 * @returns The newly created forked recipe.
 * @throws {ConflictError} `409 SLUG_CONFLICT` when every slug candidate is taken.
 */
export async function forkRecipe(sourceId: string, authorId: string, title?: string) {
  logger.debug({ sourceId, authorId }, 'forkRecipe started');
  const source = await model.findById(sourceId);
  if (!source) throw new Error('RECIPE_NOT_FOUND');
  if (source.visibility === 'draft' || source.visibility === 'private') {
    if (source.authorId !== authorId) throw new Error('FORBIDDEN');
  }

  const forkTitle = sanitizeText(title) || `Fork of ${source.title}`;
  const candidates = buildRecipeSlugCandidates(forkTitle);

  const forked = await model.forkRecipe(sourceId, authorId, forkTitle, candidates);
  if (forked === null) throw slugExhausted(authorId, candidates.length);

  evaluateBadges(authorId).catch((err) => logger.error({ err }, 'evaluateBadges failed'));

  logger.debug({ sourceId, authorId }, 'forkRecipe completed');
  return forked;
}

/**
 * Run one recipe list query, replacing a statement timeout with a sanitized error.
 *
 * A query cancelled by the pool's `statement_timeout` (SQLSTATE `57014`, on the error
 * or on the Drizzle error's `cause`) is logged at `warn` with ids and the term's length
 * only, then rethrown as `new Error('QUERY_TIMEOUT')` WITHOUT a cause, so the SQL text,
 * bound parameters and search term never reach a log line; the global error handler
 * maps it to 503 `QUERY_TIMEOUT`. Any other error is rethrown unchanged.
 *
 * @param query - Starts the model query.
 * @param requestId - The request id for the log line.
 * @param searchLength - Length of the normalized search term (0 without search).
 * @returns The query result.
 */
async function runListQuery<T>(
  query: () => Promise<T>,
  requestId: string | undefined,
  searchLength: number,
): Promise<T> {
  try {
    return await query();
  } catch (err) {
    if (isStatementTimeout(err)) {
      logger.warn({ requestId, searchLength, pgCode: '57014' }, 'Recipe list query timed out');
      throw new Error('QUERY_TIMEOUT');
    }
    throw err;
  }
}

/**
 * Cursor-aware recipe listing.
 *
 * When `filters.cursor` is present and `filters.sortBy === 'createdAt'`, the
 * service validates and decodes the cursor, then delegates to
 * {@link model.findCursor}. If the cursor is malformed, throws
 * `VALIDATION_ERROR: INVALID_CURSOR` so the route returns 400.
 *
 * When `filters.cursor` is present with an incompatible sort (e.g. `likeCount`
 * or `rating`), logs a warning and falls back to offset pagination.
 *
 * When both `page` and `cursor` are provided, cursor wins and `page` is
 * silently ignored.
 *
 * When `search` is non-empty after {@link model.normalizeSearchTerm}, the request
 * uses offset pagination (a cursor is ignored) and {@link model.findListPage}
 * ranks, orders and pages the matches in SQL: one bounded page query plus one
 * `COUNT`, never the full result set. A statement timeout becomes
 * `QUERY_TIMEOUT` (503) with a sanitized log line.
 *
 * @param filters           - Filter criteria (see controller for accepted keys).
 * @param page              - Page number (1-based) for offset mode.
 * @param perPage           - Items per page.
 * @param _requestingUserId - Unused; reserved for future scoped queries.
 * @param isAdmin           - Whether the requester is an admin: only an admin's `visibility` filter
 *                            is honoured; everyone else gets the public discovery list
 *                            (`listableRecipeCondition(null)`, capability `recipe-visibility`).
 * @param requestId         - The request id for log lines.
 * @returns Either `{ recipes, total }` for offset mode or
 *          `{ recipes, hasMore, nextCursor, total? }` for cursor mode.
 */
export async function listRecipes(
  filters: z.infer<typeof RecipeFilterSchema>,
  page: number,
  perPage: number,
  _requestingUserId: string | null = null,
  isAdmin: boolean = false,
  requestId?: string,
) {
  const where = model.buildListRecipesWhere(filters, isAdmin);
  const sortBy = filters.sortBy || 'createdAt';
  const sortOrder = filters.sortOrder || 'desc';

  // Search-active detection uses the same normalized term as the filter and the score.
  const search = model.normalizeSearchTerm(filters.search);
  const hasSearch = search.length > 0;

  logger.debug(
    { userId: _requestingUserId, page, perPage, requestId, hasSearch },
    'listRecipes started',
  );

  const deprecations: { tasteNoteId?: boolean } = {};
  if (!filters.tasteNoteIds && filters.tasteNoteId) {
    deprecations.tasteNoteId = true;
    logger.warn(
      { filter: 'tasteNoteId', userId: _requestingUserId, requestId },
      'Deprecated query parameter used',
    );
  }

  const withDeprecations = <T>(result: T): T & { deprecations?: { tasteNoteId?: boolean } } =>
    deprecations.tasteNoteId
      ? { ...result, deprecations }
      : (result as T & { deprecations?: { tasteNoteId?: boolean } });

  // F11: search active → skip cursor path (the SQL relevance score orders the results, so a
  // (createdAt, id) keyset cursor does not follow the result order)
  if (filters.cursor && !hasSearch) {
    if (page > 1) {
      logger.debug(
        { userId: _requestingUserId, page, perPage },
        'Both cursor and page provided, using cursor pagination',
      );
    } else {
      logger.debug(
        { userId: _requestingUserId, page, perPage },
        'Cursor provided, using cursor pagination',
      );
    }

    if (sortBy !== 'createdAt') {
      logger.warn({ sortBy }, 'Cursor pagination incompatible with sortBy, falling back to offset');
      const result = await runListQuery(
        () => model.findMany(where, page, perPage, sortBy, sortOrder),
        requestId,
        0,
      );
      logger.debug(
        { userId: _requestingUserId, page, perPage, resultCount: result.total },
        'listRecipes completed',
      );
      return withDeprecations(result);
    }

    let cursor: { createdAt: string; id: string };
    try {
      cursor = decodeCursor(filters.cursor);
    } catch (err) {
      logger.error({ err }, 'Invalid cursor provided');
      throw new Error('VALIDATION_ERROR: INVALID_CURSOR');
    }

    let result: Awaited<ReturnType<typeof model.findCursor>>;
    try {
      result = await runListQuery(
        () => model.findCursor(where, cursor, perPage, sortOrder, filters.includeTotal),
        requestId,
        0,
      );
    } catch (err) {
      // findCursor throws VALIDATION_ERROR: INVALID_CURSOR when the decoded
      // cursor's createdAt is not a valid date — surface it as a 400, not 500.
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'VALIDATION_ERROR: INVALID_CURSOR') {
        logger.error(
          { err, userId: _requestingUserId, page, perPage },
          'Invalid cursor payload provided',
        );
        throw new Error('VALIDATION_ERROR: INVALID_CURSOR');
      }
      throw err;
    }
    logger.debug(
      { userId: _requestingUserId, perPage, hasMore: result.hasMore },
      'listRecipes completed',
    );
    return withDeprecations(result);
  }

  // F11: search + cursor → offset fallback (the SQL relevance score reorders, keyset cursor
  // non-deterministic)
  if (filters.cursor && hasSearch) {
    logger.debug(
      { requestId, hasSearch: true, searchLength: filters.search?.length ?? 0 },
      'Search active, falling back to offset pagination for ranking',
    );
  }

  // Search or not, ranking, ordering and paging happen in SQL (one bounded page query
  // plus one COUNT); the normalized term drives the relevance score.
  const result = await runListQuery(
    () => model.findListPage({ where, page, perPage, sortBy, sortOrder, search }),
    requestId,
    search.length,
  );
  logger.debug(
    { userId: _requestingUserId, page, perPage, resultCount: result.total },
    'listRecipes completed',
  );
  return withDeprecations(result);
}

/**
 * List starred recipes, always using offset pagination.
 *
 * Starred is a viewer-only record (capability `recipe-visibility`): it lists the
 * caller's favourites that the caller can open (`viewableRecipeCondition(userId)` in
 * {@link model.findStarred}), so favourited `unlisted` recipes appear and another
 * author's recipe that became `private`/`draft` or was deleted drops out.
 *
 * Starred queries (`/recipes/starred`) involve a favourites subquery JOIN that
 * is not yet compatible with cursor pagination; a cursor parameter is silently
 * ignored with a debug log. The normalized `search` is passed through, so a starred
 * search is relevance-ranked in SQL by the same bounded query as `/recipes`; a
 * statement timeout becomes `QUERY_TIMEOUT` (503).
 *
 * @param filters - Filter criteria, including ignored `cursor`.
 * @param page    - Page number (1-based).
 * @param perPage - Items per page.
 * @param userId  - UUID of the authenticated user whose favourites to query.
 * @param requestId - The request id for log lines.
 * @returns Paginated recipe list with total count.
 */
export async function listStarredRecipes(
  filters: z.infer<typeof RecipeFilterSchema>,
  page: number,
  perPage: number,
  userId: string,
  requestId?: string,
) {
  logger.debug({ userId }, 'listStarredRecipes started');
  if (filters.cursor) {
    logger.debug('Cursor provided but starred recipes use offset pagination, using offset');
  }

  const deprecations: { tasteNoteId?: boolean } = {};
  if (!filters.tasteNoteIds && filters.tasteNoteId) {
    deprecations.tasteNoteId = true;
    logger.warn({ filter: 'tasteNoteId', userId, requestId }, 'Deprecated query parameter used');
  }

  // The normalized term drives the starred filter and its SQL relevance ranking.
  const search = model.normalizeSearchTerm(filters.search);
  const result = await runListQuery(
    () => model.findStarred(userId, { ...filters, search }, page, perPage),
    requestId,
    search.length,
  );
  logger.debug({ userId }, 'listStarredRecipes completed');
  return {
    ...result,
    ...(deprecations.tasteNoteId ? { deprecations } : {}),
  };
}

/**
 * Toggle a user's like on a recipe.
 *
 * Returns the new liked state. When liking (not un-liking) a recipe by a
 * different author, fires `createLikeNotification` (F05), which owns BOTH
 * the in-app `like` notification record AND the recipe-liked email (gated
 * on `notifyRecipeLiked` prefs — single flag gates both channels).
 */
export async function toggleLike(userId: string, recipeId: string) {
  logger.debug({ userId, recipeId }, 'toggleLike started');
  const recipe = await model.findById(recipeId);
  if (!recipe) throw new Error('RECIPE_NOT_FOUND');
  const result = await model.toggleLike(userId, recipeId);

  if (result.liked && recipe.authorId !== userId) {
    (async () => {
      const liker = await model.getUserById(userId);
      if (!liker?.username) return;
      // F05: createLikeNotification owns BOTH the in-app `like` record AND
      // the recipe-liked email (gated on `notifyRecipeLiked` prefs — single
      // flag gates both). No direct notifyRecipeLiked call here — that would
      // double-send and bypass the preference gate.
      await createLikeNotification({
        likerId: userId,
        likerUsername: liker.username,
        recipeAuthorId: recipe.authorId,
        recipeId,
        recipeSlug: recipe.slug,
        recipeTitle: recipe.title,
      });
    })().catch((err) => logger.error({ err, recipeId }, 'createLikeNotification failed'));
  }

  logger.debug({ userId, recipeId }, 'toggleLike completed');
  return result;
}

/** Toggle a recipe in the user's favourites. Returns the new favourited state. */
export async function toggleFavourite(userId: string, recipeId: string) {
  logger.debug({ userId, recipeId }, 'toggleFavourite started');
  const recipe = await model.findById(recipeId);
  if (!recipe) throw new Error('RECIPE_NOT_FOUND');
  const result = await model.toggleFavourite(userId, recipeId);
  logger.debug({ userId, recipeId }, 'toggleFavourite completed');
  return result;
}

/** Toggle the featured flag on the requesting user's own recipe. Throws `FORBIDDEN` if not the author. */
export async function toggleFeature(recipeId: string, authorId: string) {
  logger.debug({ recipeId, authorId }, 'toggleFeature started');
  const recipe = await model.findById(recipeId);
  if (!recipe) throw new Error('RECIPE_NOT_FOUND');
  if (recipe.authorId !== authorId) throw new Error('FORBIDDEN');
  const result = await model.toggleFeature(recipeId);
  logger.debug({ recipeId, authorId }, 'toggleFeature completed');
  return result;
}

/**
 * Return lightweight metadata for a recipe by slug.
 *
 * Includes title, author, visibility, counts, and the primary photo URL.
 * Used for SEO / social sharing previews and link unfurling.
 */
export async function getRecipeMeta(slug: string) {
  logger.debug({ slug }, 'getRecipeMeta started');
  const recipe = await model.findBySlug(slug);
  if (!recipe) throw new Error('RECIPE_NOT_FOUND');
  const latestVersion = recipe.versions?.[0];
  logger.debug({ slug }, 'getRecipeMeta completed');
  return {
    id: recipe.id,
    title: recipe.title,
    slug: recipe.slug,
    author: recipe.author,
    visibility: recipe.visibility,
    likeCount: recipe.likeCount,
    commentCount: recipe.commentCount,
    createdAt: recipe.createdAt,
    productName: latestVersion?.productName || null,
    brewMethod: latestVersion?.brewMethod || null,
    photoUrl: recipe.photos?.[0]?.url || null,
  };
}

/**
 * True when the caller may view the recipe.
 *
 * Canonical visibility predicate (previously duplicated inline at
 * `recipe/index.ts` GET /:slugOrId and GET /:slug/versions): `public`/`unlisted`
 * are visible to any caller including anonymous; `draft`/`private` are visible
 * only to the author (`userId === recipe.authorId`) or to an admin. The admin
 * bypass is deliberate: the recipe GET routes do NOT pass an admin flag (they
 * keep their pre-existing author-only semantics), but the comment surface does
 * — the comment-reply permission rule already honours `isAdmin`
 * (comment/service.ts), so the predicate supports it for that caller.
 *
 * Pure function with no I/O — intentionally has no entry/exit debug logging;
 * the calling routes/services already log.
 *
 * @param recipe - Minimal recipe shape: visibility + authorId
 * @param userId - Authenticated caller id, or null/undefined when anonymous
 * @param isAdmin - Whether the caller has admin privileges
 * @returns true when the caller may view the recipe
 */
export function canViewRecipe(
  recipe: { visibility: string; authorId: string },
  userId?: string | null,
  isAdmin?: boolean,
): boolean {
  if (recipe.visibility === 'draft' || recipe.visibility === 'private') {
    return userId === recipe.authorId || isAdmin === true;
  }
  return true;
}

/**
 * Pure predicate: may the viewer see this recipe in a LIST? (capability
 * `recipe-visibility`, "One shared listing condition and predicate pair decides
 * visibility"). True exactly when the recipe is not soft-deleted (`deletedAt`
 * null or absent) AND it is `public` or the viewer is its author. `unlisted`
 * recipes open by link ({@link canViewRecipe}) but are never listed to anyone
 * but their author. The pure twin of `listableRecipeCondition` in `model.ts`.
 *
 * There is no admin parameter: admin surfaces do not use this predicate, and
 * collection items deliberately ignore the admin flag. Callers such as the
 * collection service use it to filter items and to mask fork sources
 * (`canListRecipe(source, null)`).
 *
 * Pure function with no I/O — intentionally has no entry/exit debug logging,
 * the same deliberate deviation as {@link canViewRecipe}; the callers log.
 *
 * @param recipe - Minimal recipe shape: visibility, authorId and optional deletedAt
 * @param viewerId - The viewer's user id, or null/undefined when anonymous
 * @returns true when the recipe may appear in a listing shown to the viewer
 */
export function canListRecipe(
  recipe: { visibility: string; authorId: string; deletedAt?: Date | string | null },
  viewerId?: string | null,
): boolean {
  if (recipe.deletedAt !== null && recipe.deletedAt !== undefined) return false;
  if (recipe.visibility === 'public') return true;
  return viewerId !== null && viewerId !== undefined && viewerId === recipe.authorId;
}

/** The fork fields of a recipe response (capability `recipe-visibility`). */
export interface ForkAttribution {
  /** The source's public identity, or `null` when the viewer may not list the source. */
  forkedFrom: { id: string; slug: string; title: string } | null;
  /** The source's id, or `null` when masked (or not a fork). */
  forkedFromId: string | null;
  /** The source's slug, or `null` when masked (or not a fork). */
  forkedFromSlug: string | null;
}

/** The fork source as loaded by `findById`/`findBySlug`: identity plus visibility state. */
export interface ForkSourceState {
  id: string;
  slug: string;
  title: string;
  visibility: string;
  authorId: string;
  deletedAt: Date | string | null;
}

/**
 * Decide the fork fields a viewer may see on a recipe detail (capability
 * `recipe-visibility`, "Fork attribution never reveals a recipe the viewer could not
 * list"). An `unlisted` recipe's id works as its link, so the source is kept only when
 * {@link canListRecipe}`(source, viewerId)` is true: it is not soft-deleted and is `public`,
 * or the viewer is the source's author. Otherwise all three fields are `null`.
 *
 * The returned `forkedFrom` carries only `{ id, slug, title }`, never the source's
 * `visibility`, `authorId` or `deletedAt`. Callers spread the result over the loaded recipe,
 * so the raw `forkedFromId` and `forkedFrom` are overwritten.
 *
 * @param forkedFrom - The loaded fork source, or `null`/`undefined` when the recipe is not a fork.
 * @param viewerId - The viewer's user id, or `null`/`undefined` when anonymous.
 * @returns `{ forkedFrom, forkedFromId, forkedFromSlug }` for the response.
 */
export function resolveForkAttribution(
  forkedFrom: ForkSourceState | null | undefined,
  viewerId?: string | null,
): ForkAttribution {
  logger.debug({ viewerId }, 'resolveForkAttribution started');
  if (!forkedFrom || !canListRecipe(forkedFrom, viewerId)) {
    logger.debug({ viewerId, masked: Boolean(forkedFrom) }, 'resolveForkAttribution completed');
    return { forkedFrom: null, forkedFromId: null, forkedFromSlug: null };
  }
  const { id, slug, title } = forkedFrom;
  logger.debug({ viewerId, masked: false }, 'resolveForkAttribution completed');
  return { forkedFrom: { id, slug, title }, forkedFromId: id, forkedFromSlug: slug };
}

// ponytail: no entry/exit debug logs on these 6 passthroughs — deliberate deviation,
// same precedent as canViewRecipe above. Add logging if these gain business logic.

/** List all versions for a recipe. */
export function getVersionsByRecipeId(recipeId: string) {
  return model.getVersionsByRecipeId(recipeId);
}

/** Fetch the current user's like and favourite status for a recipe. */
export function getUserLikeStatus(userId: string, recipeId: string) {
  return model.getUserLikeStatus(userId, recipeId);
}

/** Count the total number of users who have favourited a recipe. */
export function getFavouriteCount(recipeId: string) {
  return model.getFavouriteCount(recipeId);
}

/** Compute the average rating and total rating count for a recipe. */
export function getRecipeRatingStats(recipeId: string) {
  return model.getRecipeRatingStats(recipeId);
}

/** Fetch a specific user's rating for a recipe, or null if they haven't rated it. */
export function getUserRating(userId: string, recipeId: string) {
  return model.getUserRating(userId, recipeId);
}

/** Create or update a user's rating for a recipe. */
export function upsertUserRating(userId: string, recipeId: string, rating: number) {
  return model.upsertUserRating(userId, recipeId, rating);
}

export function getMergedIds(
  list1: { [key: string]: unknown }[] | undefined,
  list2: { [key: string]: unknown }[] | undefined,
  choice: string | undefined,
  idField: string,
): string[] {
  if (!choice || choice === 'none') return [];
  if (choice === 'v1') return (list1 ?? []).map((x) => x[idField] as string);
  if (choice === 'v2') return (list2 ?? []).map((x) => x[idField] as string);
  const ids = new Set<string>();
  (list1 ?? []).forEach((x) => {
    ids.add(x[idField] as string);
  });
  (list2 ?? []).forEach((x) => {
    ids.add(x[idField] as string);
  });
  return Array.from(ids);
}

export function getMergedPreparations(
  v1: { additionalPreparations?: unknown[] },
  v2: { additionalPreparations?: unknown[] },
  choice?: string,
): unknown[] {
  if (!choice || choice === 'none') return [];
  if (choice === 'v1') return v1.additionalPreparations ?? [];
  if (choice === 'v2') return v2.additionalPreparations ?? [];
  return [...(v1.additionalPreparations ?? []), ...(v2.additionalPreparations ?? [])];
}

/**
 * Merge two recipe versions into a new draft recipe.
 *
 * Delegates the write to {@link createRecipe}, so the merged recipe gets its
 * slug from the same pipeline (sanitized title, candidates claimed in the
 * creation transaction): merging twice with the same title yields distinct
 * slugs, and exhausted candidates surface as `409 SLUG_CONFLICT`.
 *
 * @param authorId - UUID of the user performing the merge.
 * @param data - Validated merge selection payload.
 * @returns The newly created draft recipe.
 */
export async function mergeRecipes(authorId: string, data: RecipeMerge) {
  logger.debug({ authorId }, 'mergeRecipes started');

  const v1 = await model.fetchRecipeVersionWithRelations(data.recipeVersionId1);
  const v2 = await model.fetchRecipeVersionWithRelations(data.recipeVersionId2);

  if (!v1 || !v2) throw new Error('RECIPE_NOT_FOUND');

  const canAccess = (v: typeof v1) =>
    v.recipe.authorId === authorId || v.recipe.visibility === 'public';
  if (!canAccess(v1) || !canAccess(v2)) throw new Error('FORBIDDEN');

  const sel = data.selections;
  const pick = <K extends keyof typeof v1>(field: K) => {
    const choice = sel[field as keyof typeof sel];
    if (!choice || choice === 'none') return null;
    if (choice === 'v2') return v2[field];
    return v1[field];
  };

  const mergedData = {
    title: data.title,
    visibility: 'draft' as const,
    brewMethod: pick('brewMethod') ?? v1.brewMethod,
    drinkType: pick('drinkType') ?? v1.drinkType,
    grindSize: pick('grindSize') ?? undefined,
    groundWeightGrams: pick('groundWeightGrams') ?? undefined,
    extractionTimeSeconds: pick('extractionTimeSeconds') ?? undefined,
    extractionVolumeMl: pick('extractionVolumeMl') ?? undefined,
    temperatureCelsius: pick('temperatureCelsius') ?? undefined,
    brewerDetails: pick('brewerDetails') ?? undefined,
    grinder: pick('grinder') ?? undefined,
    preparationNotes: pick('preparationNotes') || 'Merged recipe',
    personalNotes: pick('personalNotes') ?? undefined,
    isFavourite: false,
    tasteNoteIds: getMergedIds(v1.tasteNotes, v2.tasteNotes, sel.tasteNotes, 'tasteNoteId'),
    equipmentIds: getMergedIds(v1.equipment, v2.equipment, sel.equipment, 'equipmentId'),
    additionalPreparations: getMergedPreparations(v1, v2, sel.additionalPreparations) as Array<{
      name: string;
      type: 'milk' | 'water' | 'syrup' | 'spice' | 'other';
      inputAmount: string;
      preparationType: string;
    }>,
  };

  try {
    const recipe = await createRecipe(authorId, mergedData);
    logger.debug({ authorId, recipeId: recipe?.id }, 'mergeRecipes completed');
    return recipe;
  } catch (err) {
    logger.error({ err, authorId }, 'mergeRecipes failed');
    throw err;
  }
}

/** The 20 scalar fields compared between two recipe versions. */
const DIFF_SCALAR_FIELDS = [
  'brewMethod',
  'drinkType',
  'productName',
  'coffeeBrand',
  'coffeeProcessing',
  'grindSize',
  'grinder',
  'brewerDetails',
  'groundWeightGrams',
  'extractionTimeSeconds',
  'extractionVolumeMl',
  'temperatureCelsius',
  'brewRatio',
  'flowRate',
  'preInfusionTimeSeconds',
  'tds',
  'preparationNotes',
  'personalNotes',
  'rating',
  'emojiTag',
] as const;

/**
 * Compute a field-by-field diff between two versions of the same recipe.
 *
 * @param recipeId - The recipe both versions must belong to.
 * @param v1Id - UUID of the first (older) version.
 * @param v2Id - UUID of the second (newer) version.
 * @returns A structured diff payload matching `VersionDiffOutputSchema`.
 * @throws Error('VERSION_NOT_FOUND') if either version is missing or belongs to a different recipe.
 * @throws Error('SAME_VERSION') if v1Id === v2Id.
 */
export async function diffVersions(recipeId: string, v1Id: string, v2Id: string) {
  logger.debug({ recipeId, v1Id, v2Id }, 'diffVersions started');

  if (v1Id === v2Id) throw new Error('SAME_VERSION');

  try {
    const [v1, v2] = await Promise.all([
      model.fetchRecipeVersionWithRelations(v1Id),
      model.fetchRecipeVersionWithRelations(v2Id),
    ]);

    if (!v1 || !v2 || v1.recipeId !== recipeId || v2.recipeId !== recipeId) {
      throw new Error('VERSION_NOT_FOUND');
    }

    const fields = DIFF_SCALAR_FIELDS.map((field) => {
      const value1 = v1[field] ?? null;
      const value2 = v2[field] ?? null;
      let status: 'added' | 'removed' | 'modified' | 'unchanged';
      if (value1 === null && value2 !== null) status = 'added';
      else if (value1 !== null && value2 === null) status = 'removed';
      else if (value1 !== value2) status = 'modified';
      else status = 'unchanged';
      return { field, value1, value2, status };
    });

    const names1 = new Set(v1.tasteNotes.map((tn) => tn.tasteNote.name));
    const names2 = new Set(v2.tasteNotes.map((tn) => tn.tasteNote.name));
    const tasteNotes = {
      added: [...names2].filter((n) => !names1.has(n)),
      removed: [...names1].filter((n) => !names2.has(n)),
      unchanged: [...names1].filter((n) => names2.has(n)),
    };

    const equip1 = new Set(v1.equipment.map((e) => e.equipment.name));
    const equip2 = new Set(v2.equipment.map((e) => e.equipment.name));
    const equipment = {
      added: [...equip2].filter((n) => !equip1.has(n)),
      removed: [...equip1].filter((n) => !equip2.has(n)),
      unchanged: [...equip1].filter((n) => equip2.has(n)),
    };

    const result = {
      version1: {
        id: v1.id,
        versionNumber: v1.versionNumber,
        brewDate: new Date(v1.brewDate).toISOString(),
      },
      version2: {
        id: v2.id,
        versionNumber: v2.versionNumber,
        brewDate: new Date(v2.brewDate).toISOString(),
      },
      fields,
      tasteNotes,
      equipment,
    };

    logger.debug({ recipeId, v1Id, v2Id }, 'diffVersions completed');
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'VERSION_NOT_FOUND') {
      logger.debug({ recipeId, v1Id, v2Id }, 'diffVersions version not found');
    } else {
      logger.error({ err, recipeId, v1Id, v2Id }, 'diffVersions failed');
    }
    throw err;
  }
}
