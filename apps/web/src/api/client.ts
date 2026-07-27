import { sessionId } from '../utils/sessionId.ts';
import { createLogger } from '@/utils/logger.ts';

const log = createLogger('api-client');

// API base URL resolution order:
//   1. Runtime config — `globalThis.__BREWFORM_CONFIG__.apiUrl`, written into /config.js
//      at container start by docker-web-entrypoint.sh from the $VITE_API_URL env var.
//      Lets one prebuilt image be retargeted at deploy time with no rebuild.
//   2. Build-time `import.meta.env.VITE_API_URL`, inlined into the bundle by Vite.
//   3. Same-origin `/api/v1` fallback.
const runtimeConfig =
  (globalThis as { __BREWFORM_CONFIG__?: { apiUrl?: string } }).__BREWFORM_CONFIG__;
const API_BASE = runtimeConfig?.apiUrl || import.meta.env.VITE_API_URL || '/api/v1';

/**
 * Parsed API response body: the success envelope carries the payload under
 * `data`, the error envelope carries `error` (see `apps/api/src/utils/openapi`).
 */
type ResponseEnvelope = {
  data: unknown;
  error?: {
    code?: string;
    message?: string;
    details?: Array<{ field: string; message: string }>;
  };
};

async function requestInternal(endpoint: string, options: RequestInit): Promise<ResponseEnvelope> {
  log.debug({ endpoint, method: options.method }, 'API request started');

  try {
    const headers = new Headers(options.headers);
    if (!headers.has('X-Request-ID')) {
      headers.set('X-Request-ID', sessionId);
    }
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

    const data: ResponseEnvelope = await response.json();

    if (!response.ok) {
      throw new ApiError(
        data.error?.code || 'UNKNOWN_ERROR',
        data.error?.message || 'Request failed',
        data.error?.details,
        response.status,
      );
    }

    log.debug({ endpoint, status: response.status }, 'API request completed');
    return data;
  } catch (err: unknown) {
    log.error({ err, endpoint }, 'API request failed');
    throw err;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const data = await requestInternal(endpoint, options);
  // Unwrap the success envelope's generic `data` field to the caller's type (openapi/index.ts envelope convention).
  return data.data as T;
}

function requestWithMeta<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  return requestInternal(endpoint, options) as Promise<T>;
}

/**
 * Error thrown for failed API requests, carrying the server error `code`,
 * optional per-field validation `details`, and the HTTP `status`.
 */
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

/**
 * Fetch-wrapper client for the BrewForm API. Prefixes `API_BASE`
 * (runtime config → `VITE_API_URL` → same-origin `/api/v1`), sends
 * cookie credentials plus an `X-Request-ID` header, and on a 401 from
 * non-auth endpoints attempts one `POST /auth/refresh` before retrying.
 * Non-OK responses throw {@link ApiError}. Verb helpers unwrap the
 * response envelope's `data`; `getWithMeta` returns the full envelope
 * and `upload` posts `FormData` without a JSON content type.
 */
export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint, { method: 'GET' }),
  getWithMeta: <T>(endpoint: string) => requestWithMeta<T>(endpoint, { method: 'GET' }),
  post: <T, B = unknown>(endpoint: string, body: B) =>
    request<T>(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T, B = unknown>(endpoint: string, body: B) =>
    request<T>(endpoint, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T, B = unknown>(endpoint: string, body: B) =>
    request<T>(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
  upload: <T>(endpoint: string, formData: FormData) =>
    request<T>(endpoint, {
      method: 'POST',
      body: formData,
      headers: {} as Record<string, string>,
    }),
};
