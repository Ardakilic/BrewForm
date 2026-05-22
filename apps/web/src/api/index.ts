import { api, ApiError } from './client.ts';
import type { RateResponse, RecipeDetailResponse, RecipeListItem } from './types.ts';

export { api, ApiError };

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
  updateProfile: (data: Record<string, unknown>) => api.patch<AuthUser>('/users/me', data),
  deleteAccount: () => api.delete<{ message: string }>('/users/me'),
  getProfile: (username: string) => api.get<Record<string, unknown>>(`/users/${username}`),
};

export const recipeApi = {
  list: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.getWithMeta<{ data: RecipeListItem[]; meta: { pagination?: { total: number } } }>(
      `/recipes${query}`,
    );
  },
  starred: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.getWithMeta<{ data: RecipeListItem[]; meta: { pagination?: { total: number } } }>(
      `/recipes/starred${query}`,
    );
  },
  get: (slugOrId: string) => api.get<RecipeDetailResponse>(`/recipes/${slugOrId}`),
  create: (data: Record<string, unknown>) => api.post<Record<string, unknown>>('/recipes', data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch<Record<string, unknown>>(`/recipes/${id}`, data),
  delete: (id: string) => api.delete<{ message: string }>(`/recipes/${id}`),
  fork: (id: string, title?: string) =>
    api.post<Record<string, unknown>>(`/recipes/${id}/fork`, { title }),
  compare: (id1: string, id2: string) =>
    api.get<Record<string, unknown>>(`/recipes/compare/${id1}/${id2}`),
  like: (id: string) => api.post<Record<string, unknown>>(`/recipes/${id}/like`, {}),
  favourite: (id: string) => api.post<Record<string, unknown>>(`/recipes/${id}/favourite`, {}),
  feature: (id: string) => api.post<Record<string, unknown>>(`/recipes/${id}/feature`, {}),
  rate: (id: string, rating: number) => api.post<RateResponse>(`/recipes/${id}/rate`, { rating }),
  saveNotes: (id: string, notes: string) =>
    api.post<Record<string, unknown>>(`/recipes/${id}/notes`, { notes }),
};

export const tasteApi = {
  hierarchy: () => api.get<Record<string, unknown>>('/taste-notes/hierarchy'),
  search: (query: string) =>
    api.get<Record<string, unknown>[]>(`/taste-notes/search?q=${encodeURIComponent(query)}`),
  flat: () => api.get<Record<string, unknown>[]>('/taste-notes/flat'),
};

export const setupApi = {
  list: () => api.get<Record<string, unknown>[]>('/setups'),
  create: (data: Record<string, unknown>) => api.post<Record<string, unknown>>('/setups', data),
  get: (id: string) => api.get<Record<string, unknown>>(`/setups/${id}`),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch<Record<string, unknown>>(`/setups/${id}`, data),
  delete: (id: string) => api.delete<{ message: string }>(`/setups/${id}`),
};

export const beanApi = {
  list: () => api.get<Record<string, unknown>[]>('/beans'),
  create: (data: Record<string, unknown>) => api.post<Record<string, unknown>>('/beans', data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch<Record<string, unknown>>(`/beans/${id}`, data),
  delete: (id: string) => api.delete<{ message: string }>(`/beans/${id}`),
};

export const equipmentApi = {
  list: () => api.get<Record<string, unknown>[]>('/equipment'),
  create: (data: Record<string, unknown>) => api.post<Record<string, unknown>>('/equipment', data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch<Record<string, unknown>>(`/equipment/${id}`, data),
  delete: (id: string) => api.delete<{ message: string }>(`/equipment/${id}`),
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
  follow: (userId: string) => api.post<Record<string, unknown>>(`/follow/${userId}`, {}),
  unfollow: (userId: string) => api.delete(`/follow/${userId}`),
  followers: (userId: string) => api.get<Record<string, unknown>>(`/follow/${userId}/followers`),
  following: (userId: string) => api.get<Record<string, unknown>>(`/follow/${userId}/following`),
};

interface AuthUser {
  id: string;
  email: string;
  emailVerifiedAt: string | null;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  onboardingCompleted: boolean;
}

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
