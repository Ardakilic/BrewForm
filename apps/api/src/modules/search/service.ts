import * as model from './model.ts';

export async function search(filters: any, page: number, perPage: number) {
  const sortBy = filters.sortBy || 'createdAt';
  const sortOrder = filters.sortOrder || 'desc';
  return model.searchRecipes(filters, page, perPage, sortBy, sortOrder);
}

export async function refreshPopularRecipes() {
  // Stub: cache warming for popular recipes can be implemented here
  // Currently a no-op since no popular-recipe cache exists
}
