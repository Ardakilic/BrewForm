import type { AdditionalPreparationCategory } from './recipe.ts';

export interface RecipeAdditionalPreparation {
  id: string;
  recipeVersionId: string;
  name: string;
  type: AdditionalPreparationCategory;
  inputAmount: string;
  preparationType: string;
  sortOrder: number;
}
