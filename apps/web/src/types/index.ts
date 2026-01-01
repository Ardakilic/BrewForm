/**
 * BrewForm Shared Types
 * Central type definitions for the application
 */

// ============================================
// User Types
// ============================================

export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  isAdmin: boolean;
}

export interface UserProfile {
  id: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  website: string | null;
  preferredUnits: 'METRIC' | 'IMPERIAL';
  recipeCount?: number;
  favouriteCount?: number;
}

// ============================================
// Recipe Types
// ============================================

export interface RecipeVersion {
  id: string;
  title: string;
  description?: string | null;
  brewMethod: string;
  drinkType: string;
  coffeeName?: string | null;
  grindSize?: string | null;
  doseGrams: number;
  yieldGrams?: number | null;
  brewTimeSec?: number | null;
  tempCelsius?: number | null;
  pressure?: string | null;
  brewRatio?: number | null;
  tastingNotes?: string | null;
  rating?: number | null;
  tags?: string[];
}

export interface Recipe {
  id: string;
  userId: string;
  slug: string;
  visibility: 'PUBLIC' | 'PRIVATE' | 'UNLISTED';
  currentVersion: RecipeVersion;
  user?: {
    username: string;
    displayName?: string | null;
  };
  forkedFrom?: {
    title: string;
    slug: string;
    user?: {
      username: string;
    };
  };
}

export interface RecipeListItem {
  id: string;
  slug: string;
  visibility: string;
  currentVersion: {
    title: string;
    brewMethod?: string;
    drinkType?: string;
    rating?: number;
  };
  user?: {
    username: string;
    displayName?: string;
  };
}

// ============================================
// Comparison Types
// ============================================

export interface Comparison {
  id: string;
  recipeA: Recipe;
  recipeB: Recipe;
}

// ============================================
// Auth Types
// ============================================

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

export interface LoginResponse {
  user: User;
  tokens: TokenPair;
}

export interface RegisterResponse {
  user: User;
  tokens: TokenPair;
}

// ============================================
// API Response Types
// ============================================

export interface ApiError {
  code: string;
  message: string;
  errors?: Array<{ field: string; message: string }>;
}

export interface ApiPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  pagination?: ApiPagination;
}
