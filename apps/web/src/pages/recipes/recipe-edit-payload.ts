import type { RecipeUpdate } from '@brewform/shared/schemas';

/**
 * The recipe edit form's values exactly as its inputs hold them: text, number and date inputs
 * are strings (`''` when empty), the emoji select is `''` when unset, and the pickers hold id
 * lists and the selected variety id.
 */
export interface RecipeEditFormValues {
  title: string;
  visibility: NonNullable<RecipeUpdate['visibility']>;
  brewMethod: NonNullable<RecipeUpdate['brewMethod']>;
  drinkType: NonNullable<RecipeUpdate['drinkType']>;
  bumpVersion: boolean;
  productName: string;
  coffeeBrand: string;
  coffeeProcessing: string;
  roastDate: string;
  packageOpenDate: string;
  grindDate: string;
  grinder: string;
  grindSize: string;
  brewerDetails: string;
  groundWeightGrams: string;
  extractionTimeSeconds: string;
  extractionVolumeMl: string;
  temperatureCelsius: string;
  tds: string;
  rating: string;
  emojiTag: string;
  preparationNotes: string;
  personalNotes: string;
  tasteNoteIds: string[];
  tasteNoteIntensities: Record<string, number>;
  equipmentIds: string[];
  coffeeVarietyId: string | null;
}

/** The trimmed text of an input, or `null` when it is empty (an update then clears the field). */
export function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * The number a numeric input holds, or `null` when it is empty or not a finite number (an
 * update then clears the field).
 */
export function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/**
 * Builds the `PATCH /recipes/:id` body from the edit form, following the update semantics of
 * `RecipeUpdateSchema` (an absent key keeps the stored value, `null` clears it, `[]` removes
 * every related row):
 *
 * - every field the form renders is sent, so a cleared text, number, date, rating or emoji
 *   input is sent as `null`, and removing every taste note or equipment item sends `[]`;
 * - `tasteNoteIntensities` is sent with `tasteNoteIds` and carries only the selected notes;
 * - `coffeeVarietyId` is the selected variety or `null`;
 * - fields the form does not render (`additionalPreparations`, `preInfusionTimeSeconds`,
 *   `vendorId`, `beanId`, `brewDate`, `isFavourite`, `setupId`, photos) are omitted, so the API
 *   keeps them (and carries them into a bumped version).
 *
 * Pure function.
 */
export function buildRecipeUpdatePayload(values: RecipeEditFormValues): RecipeUpdate {
  const tasteNoteIntensities = Object.fromEntries(
    values.tasteNoteIds
      .filter((id) => values.tasteNoteIntensities[id] !== undefined)
      .map((id) => [id, values.tasteNoteIntensities[id]]),
  );
  return {
    title: values.title.trim(),
    visibility: values.visibility,
    brewMethod: values.brewMethod,
    drinkType: values.drinkType,
    bumpVersion: values.bumpVersion,
    productName: textOrNull(values.productName),
    coffeeBrand: textOrNull(values.coffeeBrand),
    coffeeProcessing: textOrNull(values.coffeeProcessing),
    roastDate: textOrNull(values.roastDate),
    packageOpenDate: textOrNull(values.packageOpenDate),
    grindDate: textOrNull(values.grindDate),
    grinder: textOrNull(values.grinder),
    grindSize: textOrNull(values.grindSize),
    brewerDetails: textOrNull(values.brewerDetails),
    groundWeightGrams: numberOrNull(values.groundWeightGrams),
    extractionTimeSeconds: numberOrNull(values.extractionTimeSeconds),
    extractionVolumeMl: numberOrNull(values.extractionVolumeMl),
    temperatureCelsius: numberOrNull(values.temperatureCelsius),
    tds: numberOrNull(values.tds),
    rating: numberOrNull(values.rating),
    emojiTag: textOrNull(values.emojiTag) as RecipeUpdate['emojiTag'],
    preparationNotes: values.preparationNotes.trim(),
    personalNotes: textOrNull(values.personalNotes),
    tasteNoteIds: values.tasteNoteIds,
    tasteNoteIntensities,
    equipmentIds: values.equipmentIds,
    coffeeVarietyId: values.coffeeVarietyId,
  };
}
