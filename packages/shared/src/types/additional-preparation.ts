export interface RecipeAdditionalPreparation {
  id: string;
  recipeVersionId: string;
  name: string;
  type: string;
  inputAmount: string;
  preparationType: string;
  sortOrder: number;
}