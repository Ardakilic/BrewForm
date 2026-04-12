/**
 * BrewForm Cache Module — Key Factory
 *
 * All call-sites must use these helpers to guarantee consistent key shapes.
 * Backends translate them to their native format (native arrays for Deno KV,
 * colon-joined strings for Redis).
 */

import type { CacheKey } from "./types.ts";

export const CacheKeys = {
  // Users
  user: (id: string): CacheKey => ["user", id] as const,
  userByUsername: (username: string): CacheKey =>
    ["user", "username", username] as const,

  // Recipes
  recipe: (id: string): CacheKey => ["recipe", id] as const,
  recipeBySlug: (slug: string): CacheKey => ["recipe", "slug", slug] as const,
  recipeList: (filterHash: string): CacheKey =>
    ["recipes", "list", filterHash] as const,
  latestRecipes: (limit?: number): CacheKey =>
    limit !== undefined
      ? ["recipes", "latest", limit] as const
      : ["recipes", "latest"] as const,
  popularRecipes: (limit?: number): CacheKey =>
    limit !== undefined
      ? ["recipes", "popular", limit] as const
      : ["recipes", "popular"] as const,

  // Taste Notes
  tasteNotesAll: (): CacheKey => ["taste-notes", "all"] as const,
  tasteNotesHierarchy: (): CacheKey => ["taste-notes", "hierarchy"] as const,
} as const;

export default CacheKeys;
