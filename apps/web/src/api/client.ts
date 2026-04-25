const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (token) {
    localStorage.setItem('brewform_access_token', token);
  } else {
    localStorage.removeItem('brewform_access_token');
  }
}

export function getAccessToken(): string | null {
  if (!accessToken) {
    accessToken = localStorage.getItem('brewform_access_token');
  }
  return accessToken;
}

export function clearTokens() {
  accessToken = null;
  localStorage.removeItem('brewform_access_token');
  localStorage.removeItem('brewform_refresh_token');
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('brewform_refresh_token');
  if (!refreshToken) return null;

  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    const data = await response.json();
    if (data.success) {
      setAccessToken(data.data.accessToken);
      localStorage.setItem('brewform_refresh_token', data.data.refreshToken);
      return data.data.accessToken;
    }
  } catch {
    clearTokens();
  }
  return null;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401 && token) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
      });
    } else {
      clearTokens();
      globalThis.location.href = '/login';
      throw new Error('Session expired');
    }
  }

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data.error?.code || 'UNKNOWN_ERROR',
      data.error?.message || 'Request failed',
      data.error?.details,
      response.status,
    );
  }

  return data.data as T;
}

export class ApiError extends Error {
  code: string;
  details?: Array<{ field: string; message: string }>;
  status: number;

  constructor(
    code: string,
    message: string,
    details?: Array<{ field: string; message: string }>,
    status: number = 500,
  ) {
    super(message);
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint, { method: 'GET' }),
  post: <T>(endpoint: string, body: unknown) =>
    request<T>(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(endpoint: string, body: unknown) =>
    request<T>(endpoint, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(endpoint: string, body: unknown) =>
    request<T>(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
  upload: <T>(endpoint: string, formData: FormData) =>
    request<T>(endpoint, {
      method: 'POST',
      body: formData,
      headers: {} as Record<string, string>,
    }),
};