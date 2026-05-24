/**
 * Additional-preparation type definition shared between API and frontend.
 *
 * Represents a preparation step applied to a recipe version,
 * persisted in the database as a join table row.
 */

import type { AdditionalPreparationCategory } from './recipe.ts';

/** Persisted additional preparation record linked to a recipe version. */
export interface RecipeAdditionalPreparation {
  /** UUID primary key */
  id: string;
  /** FK to the recipe version */
  recipeVersionId: string;
  /** Display name */
  name: string;
  /** Category (milk, water, syrup, spice, other) */
  type: AdditionalPreparationCategory;
  /** Amount added (free-text) */
  inputAmount: string;
  /** How the ingredient was prepared (e.g. "steamed") */
  preparationType: string;
  /** Display order among preparations */
  sortOrder: number;
}
