import type { AdditionalPreparationCategory } from './recipe';

export interface RecipeAdditionalPreparation {
  id: string;
  recipeVersionId: string;
  name: string;
  type: AdditionalPreparationCategory;
  inputAmount: string;
  preparationType: string;
  sortOrder: number;
}
