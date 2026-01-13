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
// Equipment Types
// ============================================

export interface Equipment {
  id: string;
  brand?: string;
  model: string;
  slug: string;
  type?: string;
  description?: string | null;
}

export interface Grinder extends Equipment {
  burrSize?: number;
}

export interface Brewer extends Equipment {
  brewMethod?: string;
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
  yieldMl?: number | null;
  brewTimeSec?: number | null;
  tempCelsius?: number | null;
  pressure?: string | null;
  brewRatio?: number | null;
  tastingNotes?: string | null;
  rating?: number | null;
  tags?: string[];
  grinder?: Grinder | null;
  brewer?: Brewer | null;
  portafilter?: Equipment | null;
  basket?: Equipment | null;
  puckScreen?: Equipment | null;
  paperFilter?: Equipment | null;
  tamper?: Equipment | null;
  coffee?: {
    id: string;
    name: string;
    origin?: string;
    vendor?: { name: string } | null;
  } | null;
}

export interface Recipe {
  id: string;
  userId: string;
  slug: string;
  visibility: 'PUBLIC' | 'PRIVATE' | 'UNLISTED' | 'DRAFT';
  currentVersion: RecipeVersion;
  commentCount?: number;
  favouriteCount?: number;
  viewCount?: number;
  forkCount?: number;
  user?: {
    id: string;
    username: string;
    displayName?: string | null;
    avatarUrl?: string | null;
  };
  forkedFrom?: {
    id: string;
    slug: string;
    currentVersion?: { title: string };
    user?: {
      username: string;
    };
  };
}

// ============================================
// Comment Types
// ============================================

export interface Comment {
  id: string;
  content: string;
  isEdited: boolean;
  isAuthor: boolean;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    username: string;
    displayName?: string | null;
    avatarUrl?: string | null;
  };
  replies?: Comment[];
}

// ============================================
// Notification Types
// ============================================

export interface Notification {
  id: string;
  type: 'COMMENT_ON_RECIPE' | 'REPLY_TO_COMMENT' | 'RECIPE_FAVOURITED' | 'RECIPE_FORKED';
  title: string;
  message: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
  actor?: {
    id: string;
    username: string;
    displayName?: string | null;
    avatarUrl?: string | null;
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
    tags?: string[];
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
