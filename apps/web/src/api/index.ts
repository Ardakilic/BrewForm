import type { AuthUser } from '@brewform/shared/types';
import type {
  BeanCreate,
  BeanOutput,
  BeanUpdate,
  CommentOutput,
  CommentWithRepliesOutput,
  EquipmentCreate,
  EquipmentOutput,
  EquipmentUpdate,
  FollowerListItemOutput,
  FollowingListItemOutput,
  FollowOutput,
  PaginatedResponse,
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
  UserProfileUpdate,
} from '@brewform/shared/schemas';
import { api, ApiError } from './client.ts';

export { api, ApiError };

/** Rate-route response: `{ rating, avgRating, ratingCount }` returned by POST /recipes/:id/rate. */
export type RateResponse = {
  rating: number;
  avgRating: number | null;
  ratingCount: number;
};

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

export const userApi = {
  me: () => api.get<AuthUser>('/users/me'),
  updateProfile: (data: UserProfileUpdate) => api.patch<AuthUser>('/users/me', data),
  deleteAccount: () => api.delete<{ message: string }>('/users/me'),
  getProfile: (username: string) => api.get<PublicUserOutput>(`/users/${username}`),
};

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

export const tasteApi = {
  hierarchy: () => api.get<TasteNoteNodeOutput[]>('/taste-notes/hierarchy'),
  search: (query: string) =>
    api.get<TasteNoteOutput[]>(`/taste-notes/search?q=${encodeURIComponent(query)}`),
  flat: () => api.get<TasteNoteOutput[]>('/taste-notes/flat'),
};

export const setupApi = {
  list: () => api.get<SetupOutput[]>('/setups'),
  create: (data: SetupCreate) => api.post<SetupOutput>('/setups', data),
  get: (id: string) => api.get<SetupOutput>(`/setups/${id}`),
  update: (id: string, data: SetupUpdate) => api.patch<SetupOutput>(`/setups/${id}`, data),
  delete: (id: string) => api.delete<{ message: string }>(`/setups/${id}`),
};

export const beanApi = {
  list: () => api.get<BeanOutput[]>('/beans'),
  get: (id: string) => api.get<BeanOutput>(`/beans/${id}`),
  create: (data: BeanCreate) => api.post<BeanOutput>('/beans', data),
  update: (id: string, data: BeanUpdate) => api.patch<BeanOutput>(`/beans/${id}`, data),
  delete: (id: string) => api.delete<{ message: string }>(`/beans/${id}`),
};

export const equipmentApi = {
  list: () => api.get<EquipmentOutput[]>('/equipment'),
  create: (data: EquipmentCreate) => api.post<EquipmentOutput>('/equipment', data),
  update: (id: string, data: EquipmentUpdate) =>
    api.patch<EquipmentOutput>(`/equipment/${id}`, data),
  delete: (id: string) => api.delete<{ message: string }>(`/equipment/${id}`),
};

export const coffeeVarietyApi = {
  search: (q: string) =>
    api.get<CoffeeVarietySearchResult[]>(`/coffee-varieties/search?q=${encodeURIComponent(q)}`),
};

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

export const followApi = {
  follow: (userId: string) => api.post<FollowOutput>(`/follow/${userId}`, {}),
  unfollow: (userId: string) => api.delete(`/follow/${userId}`),
  followers: (userId: string) => api.get<FollowerListItemOutput[]>(`/follow/${userId}/followers`),
  following: (userId: string) => api.get<FollowingListItemOutput[]>(`/follow/${userId}/following`),
};

export const commentApi = {
  list: (recipeId: string, page: number) =>
    api.getWithMeta<PaginatedResponse<CommentWithRepliesOutput>>(
      `/comments/recipe/${recipeId}?page=${page}`,
    ),
  create: (recipeId: string, payload: { content: string; parentCommentId?: string }) =>
    api.post<CommentOutput>(`/comments/recipe/${recipeId}`, payload),
  delete: (id: string) => api.delete<{ message: string }>(`/comments/${id}`),
};

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

export interface AdminUserDetail extends AdminUser {
  bio: string | null;
  updatedAt: string;
  recipeCount?: number;
  followerCount?: number;
  followingCount?: number;
}

export interface CoffeeVarietySearchResult {
  id: string;
  name: string;
  category: string;
}
