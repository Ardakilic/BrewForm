const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

async function requestInternal(endpoint: string, options: RequestInit): Promise<unknown> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (response.status === 401 && !endpoint.startsWith('/auth/')) {
    const refreshResponse = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      credentials: 'include',
    });

    if (refreshResponse.ok) {
      response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
        credentials: 'include',
      });
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

  return data;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const data = await requestInternal(endpoint, options);
  return (data as Record<string, unknown>).data as T;
}

async function requestWithMeta<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  return requestInternal(endpoint, options) as Promise<T>;
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
  getWithMeta: <T>(endpoint: string) => requestWithMeta<T>(endpoint, { method: 'GET' }),
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
