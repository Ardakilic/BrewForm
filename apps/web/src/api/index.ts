import type {
  BadgeOutput,
  BeanCreate,
  BeanOutput,
  BeanUpdate,
  BrewLogCreate,
  BrewLogListItemOutput,
  BrewLogOutput,
  BrewLogUpdate,
  CoffeeVarietyCreate,
  CoffeeVarietyOutput,
  CoffeeVarietyUpdate,
  CollectionCreate,
  CollectionDetailOutput,
  CollectionListItemOutput,
  CollectionUpdate,
  CommentOutput,
  CommentWithRepliesOutput,
  EquipmentCreate,
  EquipmentOutput,
  EquipmentUpdate,
  FollowerListItemOutput,
  FollowingListItemOutput,
  FollowOutput,
  NotificationOutput,
  PaginatedResponse,
  PublicCollectionListItemOutput,
  PublicUserOutput,
  RecipeBrewStatsOutput,
  RecipeCollectionsOutput,
  RecipeCreate,
  RecipeDetailOutput,
  RecipeFork,
  RecipeListItemOutput,
  RecipeMerge,
  RecipeNotes,
  RecipeUpdate,
  RecipeVersionRow,
  RecipeWithAuthorOutput,
  RecipeWithVersionsOutput,
  SetupCreate,
  SetupOutput,
  SetupUpdate,
  TasteNoteNodeOutput,
  TasteNoteOutput,
  UnreadCountOutput,
  UserBrewStatsOutput,
  UserPreferences,
  UserPreferencesOutput,
  UserProfileUpdate,
  VendorOutput,
  VersionDiffOutput,
} from '@brewform/shared/schemas';
import type { AuthUser } from '@brewform/shared/types';
import { createLogger } from '@/utils/logger.ts';
import { api, type RequestOptions } from './client.ts';
import { ApiError, isAbortError, isApiError } from './errors.ts';

export type { RequestOptions };
export { ApiError, api, isAbortError, isApiError };

const notificationLog = createLogger('notificationApi');

/** Builds `?a=1&b=2` from a params record (empty string when there are no params). */
function toQuery(params?: Record<string, string>): string {
  if (!params) return '';
  const qs = new URLSearchParams(params).toString();
  return qs ? `?${qs}` : '';
}

/** Rate-route response: `{ rating, avgRating, ratingCount }` returned by POST /recipes/:id/rate. */
export type RateResponse = {
  rating: number;
  avgRating: number | null;
  ratingCount: number;
};

/** `GET /recipes/:slug/versions` payload: the recipe title/slug plus its version rows. */
export interface RecipeVersionsResponse {
  title: string;
  slug: string;
  versions: RecipeVersionRow[];
}

/**
 * Auth API client — register, login/logout, password reset, email verification,
 * and registration-status checks. Every method takes an optional trailing
 * {@link RequestOptions} (`{ signal }`), as do all domain clients below.
 */
export const authApi = {
  register: (
    data: { email: string; username: string; password: string; displayName?: string },
    opts?: RequestOptions,
  ) => api.post<{ user: AuthUser }>('/auth/register', data, opts),
  login: (data: { email: string; password: string; rememberMe?: boolean }, opts?: RequestOptions) =>
    api.post<{ user: AuthUser }>('/auth/login', data, opts),
  logout: (opts?: RequestOptions) => api.post<{ message: string }>('/auth/logout', {}, opts),
  forgotPassword: (data: { email: string }, opts?: RequestOptions) =>
    api.post<{ message: string }>('/auth/forgot-password', data, opts),
  resetPassword: (data: { token: string; newPassword: string }, opts?: RequestOptions) =>
    api.post<{ message: string }>('/auth/reset-password', data, opts),
  registrationStatus: (opts?: RequestOptions) =>
    api.get<{ enabled: boolean }>('/auth/registration-status', opts),
  sendVerification: (opts?: RequestOptions) =>
    api.post<{ message: string }>('/auth/send-verification', {}, opts),
  verifyEmail: (token: string, opts?: RequestOptions) =>
    api.post<{ message: string }>('/auth/verify-email', { token }, opts),
};

/**
 * Current-user API client — fetch/update the authenticated user, delete the
 * account, and read another user's public profile.
 */
export const userApi = {
  me: (opts?: RequestOptions) => api.get<AuthUser>('/users/me', opts),
  updateProfile: (data: UserProfileUpdate, opts?: RequestOptions) =>
    api.patch<AuthUser>('/users/me', data, opts),
  deleteAccount: (opts?: RequestOptions) => api.delete<{ message: string }>('/users/me', opts),
  getProfile: (username: string, opts?: RequestOptions) =>
    api.get<PublicUserOutput>(`/users/${username}`, opts),
};

/** Preferences patch body: any subset of the preference fields, plus the onboarding flag. */
export type PreferencesPatch = Partial<UserPreferences> & { onboardingCompleted?: boolean };

/** Preferences API client — read and patch the signed-in user's preferences. */
export const preferencesApi = {
  get: (opts?: RequestOptions) => api.get<UserPreferencesOutput>('/preferences', opts),
  update: (data: PreferencesPatch, opts?: RequestOptions) =>
    api.patch<UserPreferencesOutput>('/preferences', data, opts),
};

/** Contact-form payload posted to `POST /contact`. */
export interface ContactMessage {
  name: string;
  email: string;
  subject: string;
  message: string;
}

/** Contact API client — sends the public contact form. */
export const contactApi = {
  send: (data: ContactMessage, opts?: RequestOptions) =>
    api.post<{ message: string }>('/contact', data, opts),
};

/**
 * Recipe API client — paginated list/starred feeds, CRUD, fork, versions, and the social
 * actions (like, favourite, feature, rate, save notes).
 */
export const recipeApi = {
  list: (params?: Record<string, string>, opts?: RequestOptions) =>
    api.getWithMeta<PaginatedResponse<RecipeListItemOutput>>(`/recipes${toQuery(params)}`, opts),
  starred: (params?: Record<string, string>, opts?: RequestOptions) =>
    api.getWithMeta<PaginatedResponse<RecipeListItemOutput>>(
      `/recipes/starred${toQuery(params)}`,
      opts,
    ),
  get: (slugOrId: string, opts?: RequestOptions) =>
    api.get<RecipeDetailOutput>(`/recipes/${slugOrId}`, opts),
  create: (data: RecipeCreate, opts?: RequestOptions) =>
    api.post<RecipeDetailOutput>('/recipes', data, opts),
  update: (id: string, data: RecipeUpdate, opts?: RequestOptions) =>
    api.patch<RecipeDetailOutput>(`/recipes/${id}`, data, opts),
  delete: (id: string, opts?: RequestOptions) =>
    api.delete<{ message: string }>(`/recipes/${id}`, opts),
  fork: (id: string, title?: string, opts?: RequestOptions) =>
    api.post<RecipeDetailOutput>(`/recipes/${id}/fork`, { title } as RecipeFork, opts),
  like: (id: string, opts?: RequestOptions) =>
    api.post<{ liked: boolean }>(`/recipes/${id}/like`, {}, opts),
  favourite: (id: string, opts?: RequestOptions) =>
    api.post<{ favourited: boolean }>(`/recipes/${id}/favourite`, {}, opts),
  feature: (id: string, opts?: RequestOptions) =>
    api.post<{ featured: boolean }>(`/recipes/${id}/feature`, {}, opts),
  rate: (id: string, rating: number, opts?: RequestOptions) =>
    api.post<RateResponse>(`/recipes/${id}/rate`, { rating }, opts),
  saveNotes: (id: string, notes: string, opts?: RequestOptions) =>
    api.post<{ message: string }>(`/recipes/${id}/notes`, { notes } as RecipeNotes, opts),
  merge: (body: RecipeMerge, opts?: RequestOptions) =>
    api.post<RecipeDetailOutput, RecipeMerge>('/recipes/merge', body, opts),
  /** Fetch the version history (title, slug and version rows) of a recipe. */
  versions: (slug: string, opts?: RequestOptions) =>
    api.get<RecipeVersionsResponse>(`/recipes/${slug}/versions`, opts),
  /** Fetch a field-by-field diff between two versions of a recipe. */
  diffVersions: (slug: string, v1: string, v2: string, opts?: RequestOptions) =>
    api.get<VersionDiffOutput>(`/recipes/${slug}/versions/diff?v1=${v1}&v2=${v2}`, opts),
};

/** Taste-note API client — full hierarchy, name search, and flat list. */
export const tasteApi = {
  hierarchy: (opts?: RequestOptions) =>
    api.get<TasteNoteNodeOutput[]>('/taste-notes/hierarchy', opts),
  search: (query: string, opts?: RequestOptions) =>
    api.get<TasteNoteOutput[]>(`/taste-notes/search?q=${encodeURIComponent(query)}`, opts),
  flat: (opts?: RequestOptions) => api.get<TasteNoteOutput[]>('/taste-notes/flat', opts),
};

/** Brew-setup API client — list and CRUD over the user's saved equipment setups. */
export const setupApi = {
  list: (opts?: RequestOptions) => api.get<SetupOutput[]>('/setups', opts),
  create: (data: SetupCreate, opts?: RequestOptions) =>
    api.post<SetupOutput>('/setups', data, opts),
  get: (id: string, opts?: RequestOptions) => api.get<SetupOutput>(`/setups/${id}`, opts),
  update: (id: string, data: SetupUpdate, opts?: RequestOptions) =>
    api.patch<SetupOutput>(`/setups/${id}`, data, opts),
  delete: (id: string, opts?: RequestOptions) =>
    api.delete<{ message: string }>(`/setups/${id}`, opts),
};

/** Coffee-bean API client — list and CRUD over the user's beans. */
export const beanApi = {
  list: (opts?: RequestOptions) => api.get<BeanOutput[]>('/beans', opts),
  get: (id: string, opts?: RequestOptions) => api.get<BeanOutput>(`/beans/${id}`, opts),
  create: (data: BeanCreate, opts?: RequestOptions) => api.post<BeanOutput>('/beans', data, opts),
  update: (id: string, data: BeanUpdate, opts?: RequestOptions) =>
    api.patch<BeanOutput>(`/beans/${id}`, data, opts),
  delete: (id: string, opts?: RequestOptions) =>
    api.delete<{ message: string }>(`/beans/${id}`, opts),
};

/**
 * Equipment API client — the lookup list, the paginated public catalogue (`catalog`), a
 * single item with the recipes that use it, and CRUD over the shared equipment catalogue.
 */
export const equipmentApi = {
  list: (opts?: RequestOptions) => api.get<EquipmentOutput[]>('/equipment', opts),
  /** Paginated, filterable catalogue (`page`, `perPage`, `type`, `search`). */
  catalog: (params?: Record<string, string>, opts?: RequestOptions) =>
    api.getWithMeta<PaginatedResponse<EquipmentOutput>>(`/equipment${toQuery(params)}`, opts),
  get: (id: string, opts?: RequestOptions) => api.get<EquipmentOutput>(`/equipment/${id}`, opts),
  /** Recipes that use the item (`page`, `perPage`). */
  recipes: (id: string, params?: Record<string, string>, opts?: RequestOptions) =>
    api.get<RecipeWithAuthorOutput[]>(`/equipment/${id}/recipes${toQuery(params)}`, opts),
  create: (data: EquipmentCreate, opts?: RequestOptions) =>
    api.post<EquipmentOutput>('/equipment', data, opts),
  update: (id: string, data: EquipmentUpdate, opts?: RequestOptions) =>
    api.patch<EquipmentOutput>(`/equipment/${id}`, data, opts),
  delete: (id: string, opts?: RequestOptions) =>
    api.delete<{ message: string }>(`/equipment/${id}`, opts),
};

/**
 * Coffee-variety API client — typeahead search, the paginated catalogue (`list`), a single
 * variety, and the recipes that use it.
 */
export const coffeeVarietyApi = {
  search: (q: string, opts?: RequestOptions) =>
    api.get<CoffeeVarietySearchResult[]>(
      `/coffee-varieties/search?q=${encodeURIComponent(q)}`,
      opts,
    ),
  /** Paginated, filterable catalogue (`page`, `perPage`, `category`, `search`). */
  list: (params?: Record<string, string>, opts?: RequestOptions) =>
    api.getWithMeta<PaginatedResponse<CoffeeVarietyOutput>>(
      `/coffee-varieties${toQuery(params)}`,
      opts,
    ),
  get: (id: string, opts?: RequestOptions) =>
    api.get<CoffeeVarietyOutput>(`/coffee-varieties/${id}`, opts),
  /** Recipes that use the variety (`page`, `perPage`). */
  recipes: (id: string, params?: Record<string, string>, opts?: RequestOptions) =>
    api.get<RecipeWithVersionsOutput[]>(`/coffee-varieties/${id}/recipes${toQuery(params)}`, opts),
};

/** Badge API client — the badge catalogue. */
export const badgeApi = {
  list: (opts?: RequestOptions) => api.get<BadgeOutput[]>('/badges', opts),
};

/** Admin user-management payload for create (`POST /admin/users`). */
export interface AdminUserCreate {
  email: string;
  username: string;
  password: string;
  displayName?: string;
  bio?: string;
  isAdmin?: boolean;
  isBanned?: boolean;
}

/** Admin user-management payload for update (`PATCH /admin/users/:id`). */
export type AdminUserUpdate = Partial<AdminUserCreate>;

/**
 * Admin API client — dashboard stats, user management (list, detail, create, update,
 * ban/unban, admin role, delete), recipe moderation, the equipment/vendor/taste-note/
 * coffee-variety catalogues, compatibility rules, the audit log and the cache flush.
 */
export const adminApi = {
  getStats: (opts?: RequestOptions) => api.get<AdminDashboardStats>('/admin/stats', opts),
  /** Paginated user list (`page`, `perPage`, `q`). */
  getUsers: (params?: Record<string, string>, opts?: RequestOptions) =>
    api.getWithMeta<PaginatedResponse<AdminUser>>(`/admin/users${toQuery(params)}`, opts),
  getUserDetail: (id: string, opts?: RequestOptions) =>
    api.get<AdminUserDetail>(`/admin/users/${id}`, opts),
  createUser: (data: AdminUserCreate, opts?: RequestOptions) =>
    api.post<AdminUserDetail>('/admin/users', data, opts),
  updateUser: (id: string, data: AdminUserUpdate, opts?: RequestOptions) =>
    api.patch<AdminUserDetail>(`/admin/users/${id}`, data, opts),
  banUser: (userId: string, reason: string, opts?: RequestOptions) =>
    api.post<AdminUserDetail>(`/admin/users/${userId}/ban`, { userId, banned: true, reason }, opts),
  unbanUser: (userId: string, opts?: RequestOptions) =>
    api.post<AdminUserDetail>(`/admin/users/${userId}/ban`, { userId, banned: false }, opts),
  toggleAdmin: (userId: string, isAdmin: boolean, opts?: RequestOptions) =>
    api.patch<AdminUserDetail>(`/admin/users/${userId}/admin`, { isAdmin }, opts),
  deleteUser: (id: string, opts?: RequestOptions) =>
    api.delete<{ message: string }>(`/admin/users/${id}`, opts),
  /** Paginated recipe moderation list (`page`, `perPage`). */
  getRecipes: (params?: Record<string, string>, opts?: RequestOptions) =>
    api.getWithMeta<PaginatedResponse<AdminRecipe>>(`/admin/recipes${toQuery(params)}`, opts),
  setRecipeVisibility: (id: string, visibility: string, opts?: RequestOptions) =>
    api.patch<AdminRecipe>(`/admin/recipes/${id}/visibility`, { visibility }, opts),
  deleteRecipe: (id: string, opts?: RequestOptions) =>
    api.delete<{ message: string }>(`/admin/recipes/${id}`, opts),
  /** Paginated equipment catalogue (`page`, `perPage`). */
  getEquipment: (params?: Record<string, string>, opts?: RequestOptions) =>
    api.getWithMeta<PaginatedResponse<EquipmentOutput>>(`/admin/equipment${toQuery(params)}`, opts),
  createEquipment: (data: EquipmentCreate, opts?: RequestOptions) =>
    api.post<EquipmentOutput>('/admin/equipment', data, opts),
  updateEquipment: (id: string, data: EquipmentUpdate, opts?: RequestOptions) =>
    api.patch<EquipmentOutput>(`/admin/equipment/${id}`, data, opts),
  deleteEquipment: (id: string, opts?: RequestOptions) =>
    api.delete<{ message: string }>(`/admin/equipment/${id}`, opts),
  /** Paginated vendor list (`page`, `perPage`). */
  getVendors: (params?: Record<string, string>, opts?: RequestOptions) =>
    api.getWithMeta<PaginatedResponse<VendorOutput>>(`/admin/vendors${toQuery(params)}`, opts),
  createVendor: (data: AdminVendorInput, opts?: RequestOptions) =>
    api.post<VendorOutput>('/admin/vendors', data, opts),
  updateVendor: (id: string, data: AdminVendorInput, opts?: RequestOptions) =>
    api.patch<VendorOutput>(`/admin/vendors/${id}`, data, opts),
  deleteVendor: (id: string, opts?: RequestOptions) =>
    api.delete<{ message: string }>(`/admin/vendors/${id}`, opts),
  createTasteNote: (data: { name: string; parentId?: string }, opts?: RequestOptions) =>
    api.post<TasteNoteOutput>('/admin/taste-notes', data, opts),
  deleteTasteNote: (id: string, opts?: RequestOptions) =>
    api.delete<{ message: string }>(`/admin/taste-notes/${id}`, opts),
  /** Paginated coffee-variety catalogue (`page`, `perPage`, `category`, `search`). */
  getCoffeeVarieties: (params?: Record<string, string>, opts?: RequestOptions) =>
    api.getWithMeta<PaginatedResponse<CoffeeVarietyOutput>>(
      `/admin/coffee-varieties${toQuery(params)}`,
      opts,
    ),
  createCoffeeVariety: (data: CoffeeVarietyCreate, opts?: RequestOptions) =>
    api.post<CoffeeVarietyOutput>('/admin/coffee-varieties', data, opts),
  updateCoffeeVariety: (id: string, data: CoffeeVarietyUpdate, opts?: RequestOptions) =>
    api.patch<CoffeeVarietyOutput>(`/admin/coffee-varieties/${id}`, data, opts),
  deleteCoffeeVariety: (id: string, opts?: RequestOptions) =>
    api.delete<{ message: string }>(`/admin/coffee-varieties/${id}`, opts),
  getCompatibility: (opts?: RequestOptions) =>
    api.get<CompatibilityRule[]>('/admin/compatibility', opts),
  setCompatibility: (id: string, isCompatible: boolean, opts?: RequestOptions) =>
    api.patch<CompatibilityRule>(`/admin/compatibility/${id}`, { isCompatible }, opts),
  /** Paginated audit log (`page`, `perPage`, `entityType`). */
  getAuditLog: (params?: Record<string, string>, opts?: RequestOptions) =>
    api.getWithMeta<PaginatedResponse<AuditLogEntry>>(`/admin/audit-log${toQuery(params)}`, opts),
  flushCache: (opts?: RequestOptions) =>
    api.post<{ message: string }>('/admin/cache/flush', {}, opts),
};

/** Follow API client — follow/unfollow plus the followers and following lists. */
export const followApi = {
  follow: (userId: string, opts?: RequestOptions) =>
    api.post<FollowOutput>(`/follow/${userId}`, {}, opts),
  unfollow: (userId: string, opts?: RequestOptions) => api.delete(`/follow/${userId}`, opts),
  followers: (userId: string, opts?: RequestOptions) =>
    api.get<FollowerListItemOutput[]>(`/follow/${userId}/followers`, opts),
  following: (userId: string, opts?: RequestOptions) =>
    api.get<FollowingListItemOutput[]>(`/follow/${userId}/following`, opts),
};

/** Comment API client — paginated recipe comment list, create (with replies), and delete. */
export const commentApi = {
  list: (recipeId: string, page: number, opts?: RequestOptions) =>
    api.getWithMeta<PaginatedResponse<CommentWithRepliesOutput>>(
      `/comments/recipe/${recipeId}?page=${page}`,
      opts,
    ),
  create: (
    recipeId: string,
    payload: { content: string; parentCommentId?: string },
    opts?: RequestOptions,
  ) => api.post<CommentOutput>(`/comments/recipe/${recipeId}`, payload, opts),
  delete: (id: string, opts?: RequestOptions) =>
    api.delete<{ message: string }>(`/comments/${id}`, opts),
};

/**
 * Notification API client — paginated list, unread count, and per-item /
 * bulk mark-as-read (F04 @mention notifications). Aborted requests are rethrown
 * without an error log.
 */
export const notificationApi = {
  list: async (page: number, unreadOnly?: boolean, opts?: RequestOptions) => {
    notificationLog.debug({ page, unreadOnly }, 'notificationApi.list started');
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (unreadOnly !== undefined) params.set('unreadOnly', String(unreadOnly));
      const result = await api.getWithMeta<PaginatedResponse<NotificationOutput>>(
        `/notifications?${params}`,
        opts,
      );
      notificationLog.debug({ page, unreadOnly }, 'notificationApi.list completed');
      return result;
    } catch (err) {
      if (isAbortError(err)) throw err;
      notificationLog.error({ err, page, unreadOnly }, 'notificationApi.list failed');
      throw err;
    }
  },
  unreadCount: async (opts?: RequestOptions) => {
    notificationLog.debug({}, 'notificationApi.unreadCount started');
    try {
      const result = await api.get<UnreadCountOutput>('/notifications/unread-count', opts);
      notificationLog.debug({}, 'notificationApi.unreadCount completed');
      return result;
    } catch (err) {
      if (isAbortError(err)) throw err;
      notificationLog.error({ err }, 'notificationApi.unreadCount failed');
      throw err;
    }
  },
  markRead: async (id: string, opts?: RequestOptions) => {
    notificationLog.debug({ id }, 'notificationApi.markRead started');
    try {
      const result = await api.patch<NotificationOutput>(`/notifications/${id}/read`, {}, opts);
      notificationLog.debug({ id }, 'notificationApi.markRead completed');
      return result;
    } catch (err) {
      if (isAbortError(err)) throw err;
      notificationLog.error({ err, id }, 'notificationApi.markRead failed');
      throw err;
    }
  },
  markAllRead: async (opts?: RequestOptions) => {
    notificationLog.debug({}, 'notificationApi.markAllRead started');
    try {
      const result = await api.patch<{ message: string }>('/notifications/read-all', {}, opts);
      notificationLog.debug({}, 'notificationApi.markAllRead completed');
      return result;
    } catch (err) {
      if (isAbortError(err)) throw err;
      notificationLog.error({ err }, 'notificationApi.markAllRead failed');
      throw err;
    }
  },
};

/**
 * Collection API client — CRUD, recipe add/remove/reorder, and user-/recipe-scoped lists.
 */
export const collectionApi = {
  list: (params?: Record<string, string>, opts?: RequestOptions) =>
    api.getWithMeta<PaginatedResponse<CollectionListItemOutput>>(
      `/collections${toQuery(params)}`,
      opts,
    ),
  get: (id: string, opts?: RequestOptions) =>
    api.get<CollectionDetailOutput>(`/collections/${id}`, opts),
  create: (data: CollectionCreate, opts?: RequestOptions) =>
    api.post<CollectionDetailOutput>('/collections', data, opts),
  update: (id: string, data: CollectionUpdate, opts?: RequestOptions) =>
    api.patch<CollectionDetailOutput>(`/collections/${id}`, data, opts),
  delete: (id: string, opts?: RequestOptions) =>
    api.delete<{ message: string }>(`/collections/${id}`, opts),
  addRecipe: (id: string, recipeId: string, opts?: RequestOptions) =>
    api.post<{ message: string }>(`/collections/${id}/recipes`, { recipeId }, opts),
  removeRecipe: (id: string, recipeId: string, opts?: RequestOptions) =>
    api.delete<{ message: string }>(`/collections/${id}/recipes/${recipeId}`, opts),
  reorder: (id: string, itemIds: string[], opts?: RequestOptions) =>
    api.patch<{ message: string }>(`/collections/${id}/reorder`, { itemIds }, opts),
  listByUser: (userId: string, params?: Record<string, string>, opts?: RequestOptions) =>
    api.getWithMeta<PaginatedResponse<CollectionListItemOutput>>(
      `/users/${userId}/collections${toQuery(params)}`,
      opts,
    ),
  listPublic: (params?: Record<string, string>, opts?: RequestOptions) =>
    api.getWithMeta<PaginatedResponse<PublicCollectionListItemOutput>>(
      `/collections/public${toQuery(params)}`,
      opts,
    ),
  listByRecipe: (recipeIdOrSlug: string, opts?: RequestOptions) =>
    api.get<RecipeCollectionsOutput>(`/recipes/${recipeIdOrSlug}/collections`, opts),
};

/** Builds the optional `?page=&perPage=` query string for brew-log list endpoints. */
function brewLogQuery(params?: { page?: number; perPage?: number }): string {
  if (!params) return '';
  const search = new URLSearchParams();
  if (params.page !== undefined) search.set('page', String(params.page));
  if (params.perPage !== undefined) search.set('perPage', String(params.perPage));
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Brew-log API client — the user's brew journal: paginated lists (own / per-recipe),
 * CRUD, and user-/recipe-scoped brew stats (F02 brew journal).
 */
export const brewLogApi = {
  list: (params?: { page?: number; perPage?: number }, opts?: RequestOptions) =>
    api.getWithMeta<PaginatedResponse<BrewLogListItemOutput>>(
      `/brew-logs${brewLogQuery(params)}`,
      opts,
    ),
  listForRecipe: (
    recipeId: string,
    params?: { page?: number; perPage?: number },
    opts?: RequestOptions,
  ) =>
    api.getWithMeta<PaginatedResponse<BrewLogListItemOutput>>(
      `/brew-logs/recipe/${recipeId}${brewLogQuery(params)}`,
      opts,
    ),
  getUserStats: (opts?: RequestOptions) =>
    api.get<UserBrewStatsOutput>('/brew-logs/stats/user', opts),
  getRecipeStats: (recipeId: string, opts?: RequestOptions) =>
    api.get<RecipeBrewStatsOutput>(`/brew-logs/stats/recipe/${recipeId}`, opts),
  get: (id: string, opts?: RequestOptions) => api.get<BrewLogOutput>(`/brew-logs/${id}`, opts),
  create: (data: BrewLogCreate, opts?: RequestOptions) =>
    api.post<BrewLogOutput>('/brew-logs', data, opts),
  update: (id: string, data: BrewLogUpdate, opts?: RequestOptions) =>
    api.patch<BrewLogOutput>(`/brew-logs/${id}`, data, opts),
  remove: (id: string, opts?: RequestOptions) =>
    api.delete<{ message: string }>(`/brew-logs/${id}`, opts),
};

/** Admin user-list row — the core account fields surfaced in the admin users table. */
export interface AdminUser {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  isBanned: boolean;
  createdAt: string;
}

/** Admin user-detail projection — {@link AdminUser} plus bio, `updatedAt`, and profile counts. */
export interface AdminUserDetail extends AdminUser {
  bio: string | null;
  updatedAt: string;
  recipeCount?: number;
  followerCount?: number;
  followingCount?: number;
}

/** Admin dashboard totals returned by `GET /admin/stats`. */
export interface AdminDashboardStats {
  totalUsers: number;
  totalRecipes: number;
  totalComments: number;
  totalPhotos: number;
  recentSignups: number;
  recentRecipes: number;
}

/** Admin recipe-moderation row returned by `GET /admin/recipes`. */
export interface AdminRecipe {
  id: string;
  title: string;
  slug: string;
  visibility: string;
  author: { username: string };
  likeCount: number;
  commentCount: number;
  createdAt: string;
}

/** Admin vendor create/update body. */
export interface AdminVendorInput {
  name: string;
  website?: string;
  description?: string;
}

/** Brew-method × equipment-type compatibility rule managed at `/admin/compatibility`. */
export interface CompatibilityRule {
  id: string;
  brewMethod: string;
  equipmentType: string;
  isCompatible: boolean;
}

/** Admin audit-log row returned by `GET /admin/audit-log`. */
export interface AuditLogEntry {
  id: string;
  adminId: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string | null;
  createdAt: string;
  admin?: { username: string };
}

/** Coffee-variety typeahead result — `id`, `name`, and `category` for the search dropdown. */
export interface CoffeeVarietySearchResult {
  id: string;
  name: string;
  category: string;
}
