import type { BrewMethod, DrinkType, Visibility } from '@brewform/shared/types';

// ── Recipe detail (what GET /recipes/:slug returns after client unwrap) ──

export interface RecipeDetailResponse {
  id: string;
  slug: string;
  title: string;
  authorId: string;
  visibility: Visibility;
  likeCount: number;
  commentCount: number;
  forkCount: number;
  forkedFromId: string | null;
  featured: boolean;
  createdAt: string;
  updatedAt: string;
  versionCount: number;
  currentVersion: RecipeVersionResponse | null;
  author: RecipeAuthorResponse | null;
  tasteNotes: RecipeTasteNoteResponse[];
  equipment: RecipeEquipmentResponse[];
  bean: RecipeBeanResponse | null;
  photos: RecipePhotoResponse[];
  avgRating: number | null;
  ratingCount: number;
  userRating: number | null;
  userLiked: boolean;
  userFavourited: boolean;
  favouriteCount: number;
}

export interface RecipeVersionResponse {
  id: string;
  versionNumber: number;
  brewMethod: BrewMethod;
  drinkType: DrinkType;
  productName: string | null;
  coffeeBrand: string | null;
  coffeeProcessing: string | null;
  grinder: string | null;
  grindSize: string | null;
  brewerDetails: string | null;
  groundWeightGrams: number | null;
  extractionTimeSeconds: number | null;
  extractionVolumeMl: number | null;
  temperatureCelsius: number | null;
  tds: number | null;
  brewRatio: number | null;
  flowRate: number | null;
  preInfusionTimeSeconds: number | null;
  personalNotes: string | null;
  preparationNotes: string | null;
  rating: number | null;
  emojiTag: string | null;
  roastDate: string | null;
  packageOpenDate: string | null;
  grindDate: string | null;
  brewDate: string | null;
  bean: RecipeBeanResponse | null;
}

export interface RecipeAuthorResponse {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface RecipeTasteNoteResponse {
  id: string;
  name: string;
  intensity: number | null;
  category: string | null;
  parentId: string | null;
}

export interface RecipeEquipmentResponse {
  id: string;
  name: string;
  type: string;
  brand: string | null;
}

export interface RecipeBeanResponse {
  id: string;
  name: string;
  roaster: string | null;
  origin: string | null;
}

export interface RecipePhotoResponse {
  id: string;
  url: string;
}

// ── Recipe list item (what GET /recipes and GET /recipes/starred return per item) ──

export interface RecipeListItem {
  id: string;
  slug: string;
  title: string;
  visibility: string;
  brewMethod: string;
  drinkType: string;
  likeCount: number;
  commentCount: number;
  forkCount: number;
  featured: boolean;
  createdAt: string;
  updatedAt: string;
  author: RecipeAuthorResponse | null;
  currentVersion:
    | Pick<RecipeVersionResponse, 'brewMethod' | 'drinkType' | 'emojiTag' | 'rating'>
    | null;
  avgRating: number | null;
  userLiked: boolean;
  userFavourited: boolean;
}

// ── Rate response ──

export interface RateResponse {
  avgRating: number;
  ratingCount: number;
}

// ── Equipment / Setup list items ──

export interface EquipmentListItem {
  id: string;
  name: string;
  type: string;
  brand: string | null;
}

export interface SetupListItem {
  id: string;
  name: string;
  grinder: string | null;
  brewerDetails: string | null;
  isDefault: boolean;
}

// ── Taste note flat ──

export interface TasteNoteFlatItem {
  id: string;
  name: string;
  category: string | null;
  parentId: string | null;
}

// ── Comment ──

export interface CommentAuthor {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface CommentData {
  id: string;
  content: string;
  authorId: string;
  author?: CommentAuthor;
  createdAt: string;
  isOp?: boolean;
  replies?: CommentData[];
}

// ── Paginated response (for when we need the meta wrapper) ──

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    pagination: {
      page: number;
      perPage: number;
      total: number;
      totalPages: number;
    };
  };
}
