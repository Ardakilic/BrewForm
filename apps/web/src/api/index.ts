import { api, setAccessToken, getAccessToken, clearTokens, ApiError } from './client';

export { api, setAccessToken, getAccessToken, clearTokens, ApiError };

export const authApi = {
  register: (data: { email: string; username: string; password: string; displayName?: string }) =>
    api.post<{ user: AuthUser; accessToken: string; refreshToken: string }>('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post<{ user: AuthUser; accessToken: string; refreshToken: string }>('/auth/login', data),
  refresh: (data: { refreshToken: string }) =>
    api.post<{ user: AuthUser; accessToken: string; refreshToken: string }>('/auth/refresh', data),
  forgotPassword: (data: { email: string }) =>
    api.post<{ message: string }>('/auth/forgot-password', data),
  resetPassword: (data: { token: string; newPassword: string }) =>
    api.post<{ message: string }>('/auth/reset-password', data),
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
    return api.get<{ recipes: Record<string, unknown>[]; total: number }>(`/recipes${query}`);
  },
  get: (slugOrId: string) => api.get<Record<string, unknown>>(`/recipes/${slugOrId}`),
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
};

export const tasteApi = {
  hierarchy: () => api.get<Record<string, unknown>>('/taste-notes/hierarchy'),
  search: (query: string) =>
    api.get<Record<string, unknown>[]>(`/taste-notes/search?q=${encodeURIComponent(query)}`),
  flat: () => api.get<Record<string, unknown>[]>('/taste-notes/flat'),
};

interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  onboardingCompleted: boolean;
}