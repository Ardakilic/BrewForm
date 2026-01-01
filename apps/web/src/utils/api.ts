/**
 * BrewForm API Client
 * Handles all API requests with auth token management
 */

import type { ApiResponse } from '../types';

const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

// ============================================
// Types
// ============================================

interface RequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined>;
}

// Re-export ApiResponse for convenience
export type { ApiResponse };

// ============================================
// Token Management
// ============================================

function getAccessToken(): string | null {
  return localStorage.getItem('brewform-access-token');
}

function getRefreshToken(): string | null {
  return localStorage.getItem('brewform-refresh-token');
}

function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem('brewform-access-token', accessToken);
  localStorage.setItem('brewform-refresh-token', refreshToken);
}

function clearTokens() {
  localStorage.removeItem('brewform-access-token');
  localStorage.removeItem('brewform-refresh-token');
}

// ============================================
// API Client
// ============================================

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      clearTokens();
      return false;
    }

    const data = await response.json();
    if (data.success && data.data) {
      setTokens(data.data.accessToken, data.data.refreshToken);
      return true;
    }

    clearTokens();
    return false;
  } catch {
    clearTokens();
    return false;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {
  const url = new URL(`${API_URL}${path}`, window.location.origin);
  
  // Add query params
  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined) {
        url.searchParams.append(key, String(value));
      }
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const accessToken = getAccessToken();
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  // Build fetch options
  const fetchOptions = {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  };

  try {
    let response = await fetch(url.toString(), fetchOptions);

    // Handle 401 - try to refresh token
    if (response.status === 401 && accessToken) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        headers.Authorization = `Bearer ${getAccessToken()}`;
        response = await fetch(url.toString(), {
          ...fetchOptions,
          headers,
        });
      }
    }

    const data = await response.json();
    return data;
  } catch {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: 'Network error. Please check your connection.',
      },
    };
  }
}

// ============================================
// API Methods
// ============================================

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>('GET', path, undefined, options),

  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('POST', path, body, options),

  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PUT', path, body, options),

  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PATCH', path, body, options),

  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>('DELETE', path, undefined, options),
};

export default api;
