import type { AuthUser } from '@brewform/shared/types';
import type {
  BeanCreate,
  BeanOutput,
  BeanUpdate,
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
  RecipeCreate,
  RecipeDetailOutput,
  RecipeFork,
  RecipeListItemOutput,
  RecipeNotes,
  RecipeUpdate,
  SetupCreate,
  SetupOutput,
  SetupUpdate,
  TasteNoteNodeOutput,
  TasteNoteOutput,
  UnreadCountOutput,
  UserProfileUpdate,
} from '@brewform/shared/schemas';
import { api, ApiError } from './client.ts';
import { createLogger } from '@/utils/logger.ts';

export { api, ApiError };

const notificationLog = createLogger('notificationApi');

/** Rate-route response: `{ rating, avgRating, ratingCount }` returned by POST /recipes/:id/rate. */
export type RateResponse = {
  rating: number;
  avgRating: number | null;
  ratingCount: number;
};

/**
 * Auth API client — register, login/logout, password reset, email verification,
 * and registration-status checks.
 */
export const authApi = {
  register: (data: { email: string; username: string; password: string; displayName?: string }) =>
    api.post<{ user: AuthUser }>('/auth/register', data),
  login: (data: { email: string; password: string; rememberMe?: boolean }) =>
    api.post<{ user: AuthUser }>('/auth/login', data),
  logout: () => api.post<{ message: string }>('/auth/logout', {}),
  forgotPassword: (data: { email: string }) =>
    api.post<{ message: string }>('/auth/forgot-password', data),
  resetPassword: (data: { token: string; newPassword: string }) =>
    api.post<{ message: string }>('/auth/reset-password', data),
  registrationStatus: () => api.get<{ enabled: boolean }>('/auth/registration-status'),
  sendVerification: () => api.post<{ message: string }>('/auth/send-verification', {}),
  verifyEmail: (token: string) => api.post<{ message: string }>('/auth/verify-email', { token }),
};

/**
 * Current-user API client — fetch/update the authenticated user, delete the
 * account, and read another user's public profile.
 */
export const userApi = {
  me: () => api.get<AuthUser>('/users/me'),
  updateProfile: (data: UserProfileUpdate) => api.patch<AuthUser>('/users/me', data),
  deleteAccount: () => api.delete<{ message: string }>('/users/me'),
  getProfile: (username: string) => api.get<PublicUserOutput>(`/users/${username}`),
};

/**
 * Recipe API client — paginated list/starred feeds, CRUD, fork, and the social
 * actions (like, favourite, feature, rate, save notes).
 */
export const recipeApi = {
  list: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.getWithMeta<PaginatedResponse<RecipeListItemOutput>>(`/recipes${query}`);
  },
  starred: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.getWithMeta<PaginatedResponse<RecipeListItemOutput>>(`/recipes/starred${query}`);
  },
  get: (slugOrId: string) => api.get<RecipeDetailOutput>(`/recipes/${slugOrId}`),
  create: (data: RecipeCreate) => api.post<RecipeDetailOutput>('/recipes', data),
  update: (id: string, data: RecipeUpdate) => api.patch<RecipeDetailOutput>(`/recipes/${id}`, data),
  delete: (id: string) => api.delete<{ message: string }>(`/recipes/${id}`),
  fork: (id: string, title?: string) =>
    api.post<RecipeDetailOutput>(`/recipes/${id}/fork`, { title } as RecipeFork),
  like: (id: string) => api.post<{ liked: boolean }>(`/recipes/${id}/like`, {}),
  favourite: (id: string) => api.post<{ favourited: boolean }>(`/recipes/${id}/favourite`, {}),
  feature: (id: string) => api.post<{ featured: boolean }>(`/recipes/${id}/feature`, {}),
  rate: (id: string, rating: number) => api.post<RateResponse>(`/recipes/${id}/rate`, { rating }),
  saveNotes: (id: string, notes: string) =>
    api.post<{ message: string }>(`/recipes/${id}/notes`, { notes } as RecipeNotes),
};

/** Taste-note API client — full hierarchy, name search, and flat list. */
export const tasteApi = {
  hierarchy: () => api.get<TasteNoteNodeOutput[]>('/taste-notes/hierarchy'),
  search: (query: string) =>
    api.get<TasteNoteOutput[]>(`/taste-notes/search?q=${encodeURIComponent(query)}`),
  flat: () => api.get<TasteNoteOutput[]>('/taste-notes/flat'),
};

/** Brew-setup API client — list and CRUD over the user's saved equipment setups. */
export const setupApi = {
  list: () => api.get<SetupOutput[]>('/setups'),
  create: (data: SetupCreate) => api.post<SetupOutput>('/setups', data),
  get: (id: string) => api.get<SetupOutput>(`/setups/${id}`),
  update: (id: string, data: SetupUpdate) => api.patch<SetupOutput>(`/setups/${id}`, data),
  delete: (id: string) => api.delete<{ message: string }>(`/setups/${id}`),
};

/** Coffee-bean API client — list and CRUD over the user's beans. */
export const beanApi = {
  list: () => api.get<BeanOutput[]>('/beans'),
  get: (id: string) => api.get<BeanOutput>(`/beans/${id}`),
  create: (data: BeanCreate) => api.post<BeanOutput>('/beans', data),
  update: (id: string, data: BeanUpdate) => api.patch<BeanOutput>(`/beans/${id}`, data),
  delete: (id: string) => api.delete<{ message: string }>(`/beans/${id}`),
};

/** Equipment API client — list and CRUD over the shared equipment catalogue. */
export const equipmentApi = {
  list: () => api.get<EquipmentOutput[]>('/equipment'),
  create: (data: EquipmentCreate) => api.post<EquipmentOutput>('/equipment', data),
  update: (id: string, data: EquipmentUpdate) =>
    api.patch<EquipmentOutput>(`/equipment/${id}`, data),
  delete: (id: string) => api.delete<{ message: string }>(`/equipment/${id}`),
};

/** Coffee-variety API client — typeahead search over the variety catalogue. */
export const coffeeVarietyApi = {
  search: (q: string) =>
    api.get<CoffeeVarietySearchResult[]>(`/coffee-varieties/search?q=${encodeURIComponent(q)}`),
};

/**
 * Admin API client — user management (list, detail, create, update), ban/unban,
 * admin-role toggle, and user deletion.
 */
export const adminApi = {
  getUsers: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get<{ users: AdminUser[]; total: number }>(`/admin/users${query}`);
  },
  getUserDetail: (id: string) => api.get<AdminUserDetail>(`/admin/users/${id}`),
  createUser: (data: {
    email: string;
    username: string;
    password: string;
    displayName?: string;
    bio?: string;
    isAdmin?: boolean;
    isBanned?: boolean;
  }) => api.post<AdminUserDetail>('/admin/users', data),
  updateUser: (id: string, data: {
    email?: string;
    username?: string;
    password?: string;
    displayName?: string;
    bio?: string;
    isAdmin?: boolean;
    isBanned?: boolean;
  }) => api.patch<AdminUserDetail>(`/admin/users/${id}`, data),
  banUser: (userId: string, reason: string) =>
    api.post<AdminUserDetail>(`/admin/users/${userId}/ban`, { userId, banned: true, reason }),
  unbanUser: (userId: string) =>
    api.post<AdminUserDetail>(`/admin/users/${userId}/ban`, { userId, banned: false }),
  toggleAdmin: (userId: string, isAdmin: boolean) =>
    api.patch<AdminUserDetail>(`/admin/users/${userId}/admin`, { isAdmin }),
  deleteUser: (id: string) => api.delete<{ message: string }>(`/admin/users/${id}`),
};

/** Follow API client — follow/unfollow plus the followers and following lists. */
export const followApi = {
  follow: (userId: string) => api.post<FollowOutput>(`/follow/${userId}`, {}),
  unfollow: (userId: string) => api.delete(`/follow/${userId}`),
  followers: (userId: string) => api.get<FollowerListItemOutput[]>(`/follow/${userId}/followers`),
  following: (userId: string) => api.get<FollowingListItemOutput[]>(`/follow/${userId}/following`),
};

/** Comment API client — paginated recipe comment list, create (with replies), and delete. */
export const commentApi = {
  list: (recipeId: string, page: number) =>
    api.getWithMeta<PaginatedResponse<CommentWithRepliesOutput>>(
      `/comments/recipe/${recipeId}?page=${page}`,
    ),
  create: (recipeId: string, payload: { content: string; parentCommentId?: string }) =>
    api.post<CommentOutput>(`/comments/recipe/${recipeId}`, payload),
  delete: (id: string) => api.delete<{ message: string }>(`/comments/${id}`),
};

/**
 * Notification API client — paginated list, unread count, and per-item /
 * bulk mark-as-read (F04 @mention notifications).
 */
export const notificationApi = {
  list: async (page: number, unreadOnly?: boolean) => {
    notificationLog.debug({ page, unreadOnly }, 'notificationApi.list started');
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (unreadOnly !== undefined) params.set('unreadOnly', String(unreadOnly));
      const result = await api.getWithMeta<PaginatedResponse<NotificationOutput>>(
        `/notifications?${params}`,
      );
      notificationLog.debug({ page, unreadOnly }, 'notificationApi.list completed');
      return result;
    } catch (err) {
      notificationLog.error({ err, page, unreadOnly }, 'notificationApi.list failed');
      throw err;
    }
  },
  unreadCount: async () => {
    notificationLog.debug({}, 'notificationApi.unreadCount started');
    try {
      const result = await api.get<UnreadCountOutput>('/notifications/unread-count');
      notificationLog.debug({}, 'notificationApi.unreadCount completed');
      return result;
    } catch (err) {
      notificationLog.error({ err }, 'notificationApi.unreadCount failed');
      throw err;
    }
  },
  markRead: async (id: string) => {
    notificationLog.debug({ id }, 'notificationApi.markRead started');
    try {
      const result = await api.patch<NotificationOutput>(`/notifications/${id}/read`, {});
      notificationLog.debug({ id }, 'notificationApi.markRead completed');
      return result;
    } catch (err) {
      notificationLog.error({ err, id }, 'notificationApi.markRead failed');
      throw err;
    }
  },
  markAllRead: async () => {
    notificationLog.debug({}, 'notificationApi.markAllRead started');
    try {
      const result = await api.patch<{ message: string }>('/notifications/read-all', {});
      notificationLog.debug({}, 'notificationApi.markAllRead completed');
      return result;
    } catch (err) {
      notificationLog.error({ err }, 'notificationApi.markAllRead failed');
      throw err;
    }
  },
};

/**
 * Collection API client — CRUD, recipe add/remove/reorder, and user-scoped list.
 */
export const collectionApi = {
  list: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.getWithMeta<PaginatedResponse<CollectionListItemOutput>>(`/collections${query}`);
  },
  get: (id: string) => api.get<CollectionDetailOutput>(`/collections/${id}`),
  create: (data: CollectionCreate) => api.post<CollectionDetailOutput>('/collections', data),
  update: (id: string, data: CollectionUpdate) =>
    api.patch<CollectionDetailOutput>(`/collections/${id}`, data),
  delete: (id: string) => api.delete<{ message: string }>(`/collections/${id}`),
  addRecipe: (id: string, recipeId: string) =>
    api.post<{ message: string }>(`/collections/${id}/recipes`, { recipeId }),
  removeRecipe: (id: string, recipeId: string) =>
    api.delete<{ message: string }>(`/collections/${id}/recipes/${recipeId}`),
  reorder: (id: string, itemIds: string[]) =>
    api.patch<{ message: string }>(`/collections/${id}/reorder`, { itemIds }),
  listByUser: (userId: string, params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.getWithMeta<PaginatedResponse<CollectionListItemOutput>>(
      `/users/${userId}/collections${query}`,
    );
  },
  listPublic: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.getWithMeta<PaginatedResponse<PublicCollectionListItemOutput>>(
      `/collections/public${query}`,
    );
  },
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

/** Coffee-variety typeahead result — `id`, `name`, and `category` for the search dropdown. */
export interface CoffeeVarietySearchResult {
  id: string;
  name: string;
  category: string;
}
