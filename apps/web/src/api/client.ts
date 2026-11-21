import { createLogger } from '@/utils/logger.ts';
import { sessionId } from '../utils/sessionId.ts';
import { ApiError, isAbortError } from './errors.ts';

const log = createLogger('api-client');

// API base URL resolution order:
//   1. Runtime config — `globalThis.__BREWFORM_CONFIG__.apiUrl`, written into /config.js
//      at container start by docker-web-entrypoint.sh from the $VITE_API_URL env var.
//      Lets one prebuilt image be retargeted at deploy time with no rebuild.
//   2. Build-time `import.meta.env.VITE_API_URL`, inlined into the bundle by Vite.
//   3. Same-origin `/api/v1` fallback.
const runtimeConfig = (globalThis as { __BREWFORM_CONFIG__?: { apiUrl?: string } })
  .__BREWFORM_CONFIG__;
const API_BASE = runtimeConfig?.apiUrl || import.meta.env.VITE_API_URL || '/api/v1';

/**
 * Per-call options accepted by every verb helper and domain-client method. Loaders pass
 * `request.signal` so a superseded navigation aborts its HTTP requests.
 */
export interface RequestOptions {
  signal?: AbortSignal;
}

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

/**
 * The single in-flight `POST /auth/refresh`, shared by every request that receives a 401
 * while it runs. Cleared when it settles so a later 401 starts a fresh refresh. It is never
 * bound to a caller's signal: one caller aborting must not cancel the others' refresh.
 */
let refreshPromise: Promise<boolean> | null = null;

/** Starts (or joins) the shared session refresh; resolves `true` when it succeeded. */
function refreshSession(): Promise<boolean> {
  refreshPromise ??= fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Request-ID': sessionId },
    body: JSON.stringify({}),
    credentials: 'include',
  })
    .then((response) => response.ok)
    .catch((err: unknown) => {
      log.warn({ err }, 'API session refresh failed');
      return false;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

/**
 * Awaits `promise` but rejects with an `AbortError` as soon as `signal` aborts, without
 * cancelling the underlying work. Used to stop waiting for shared work: the session refresh
 * here and the single-flight static lookups in `static-cache.ts`.
 */
export function waitUnlessAborted<T>(promise: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (err: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      },
    );
  });
}

/** The rejection value for an aborted signal: its reason, or a DOMException `AbortError`. */
function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
}

/** Parses `text` as a JSON envelope; `null` for an empty or non-JSON body. */
function parseEnvelopeText(text: string): ResponseEnvelope | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as ResponseEnvelope;
  } catch {
    return null;
  }
}

/**
 * Reads the body as text and parses it as JSON. Returns `null` for an empty or non-JSON
 * body (for example an HTML error page from a proxy) instead of throwing `SyntaxError`.
 */
async function parseEnvelope(response: Response): Promise<ResponseEnvelope | null> {
  return parseEnvelopeText(await response.text());
}

/**
 * Parse a `Retry-After` header in its delta-seconds form (a non-negative integer).
 * The HTTP-date form and anything else yield `undefined`.
 *
 * @param value - The raw header value, or `null` when absent.
 * @returns Whole seconds to wait, or `undefined` when missing or invalid.
 */
export function parseRetryAfter(value: string | null): number | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const seconds = Number(trimmed);
  return Number.isSafeInteger(seconds) ? seconds : undefined;
}

/**
 * Sends one HTTP request to the API: adds the base URL, cookies, `X-Request-ID` and a JSON
 * content type (except for `FormData` bodies), and retries once after the shared session
 * refresh on a 401 from a non-auth endpoint. Returns the final `Response` unread.
 */
async function sendWithRefresh(endpoint: string, options: RequestInit): Promise<Response> {
  const headers = new Headers(options.headers);
  if (!headers.has('X-Request-ID')) {
    headers.set('X-Request-ID', sessionId);
  }
  if (!(options.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('Content-Type', 'application/json');
  }

  const send = () =>
    fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include',
    });

  let response = await send();

  if (response.status === 401 && !endpoint.startsWith('/auth/')) {
    const refreshed = await waitUnlessAborted(refreshSession(), options.signal);
    if (refreshed) {
      response = await send();
    }
  }
  return response;
}

/**
 * Maps a non-OK response to an {@link ApiError}: the error envelope's code, message, details
 * and `Retry-After`, or `INVALID_RESPONSE` with the HTTP status when the body is not an
 * error envelope (empty, HTML, plain text).
 */
function toApiError(response: Response, data: ResponseEnvelope | null): ApiError {
  if (!data?.error) {
    return new ApiError(
      'INVALID_RESPONSE',
      `Unexpected response from the server (HTTP ${response.status})`,
      undefined,
      response.status,
    );
  }
  return new ApiError(
    data.error.code || 'UNKNOWN_ERROR',
    data.error.message || 'Request failed',
    data.error.details,
    response.status,
    parseRetryAfter(response.headers.get('Retry-After')),
  );
}

/**
 * Runs one API call with the client's request logs: `debug` start, and on failure an `error`
 * log, except that an aborted request rethrows the `AbortError` unchanged and is logged at
 * `debug` (it is not a failure).
 */
async function withRequestLog<T>(
  endpoint: string,
  method: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  log.debug({ endpoint, method }, 'API request started');
  try {
    return await fn();
  } catch (err: unknown) {
    if (isAbortError(err)) {
      log.debug({ endpoint }, 'API request aborted');
      throw err;
    }
    log.error({ err, endpoint }, 'API request failed');
    throw err;
  }
}

/**
 * Sends one API request ({@link sendWithRefresh}), parses the body defensively, and maps
 * failures to {@link ApiError}. An aborted request rethrows the `AbortError` unchanged and is
 * logged at `debug` (it is not a failure).
 */
function requestInternal(endpoint: string, options: RequestInit): Promise<ResponseEnvelope> {
  return withRequestLog(endpoint, options.method, async () => {
    const response = await sendWithRefresh(endpoint, options);
    const data = await parseEnvelope(response);

    if (!response.ok) throw toApiError(response, data);

    if (data === null) {
      if (response.status === 204) return { data: null };
      throw new ApiError(
        'INVALID_RESPONSE',
        `Unexpected response body from the server (HTTP ${response.status})`,
        undefined,
        response.status,
      );
    }

    log.debug({ endpoint, status: response.status }, 'API request completed');
    return data;
  });
}

/**
 * Sends one API request and returns the raw body text (for non-JSON endpoints such as the
 * recipe QR-code SVG). Same base URL, session refresh, error parsing and logging as the JSON
 * helpers: a non-OK response throws {@link ApiError}.
 */
function requestText(endpoint: string, options: RequestInit): Promise<string> {
  return withRequestLog(endpoint, options.method, async () => {
    const response = await sendWithRefresh(endpoint, options);
    const text = await response.text();
    if (!response.ok) throw toApiError(response, parseEnvelopeText(text));
    log.debug({ endpoint, status: response.status }, 'API request completed');
    return text;
  });
}

/** Sends a request and unwraps the success envelope's `data` to the caller's type. */
async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const data = await requestInternal(endpoint, options);
  // Unwrap the success envelope's generic `data` field to the caller's type (openapi/index.ts envelope convention).
  return data.data as T;
}

/** Sends a request and returns the full envelope (`data` plus `meta`, e.g. pagination). */
function requestWithMeta<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  return requestInternal(endpoint, options) as Promise<T>;
}

/**
 * Fetch-wrapper client for the BrewForm API. Prefixes `API_BASE`
 * (runtime config → `VITE_API_URL` → same-origin `/api/v1`), sends
 * cookie credentials plus an `X-Request-ID` header, and on a 401 from
 * non-auth endpoints joins one shared `POST /auth/refresh` before retrying
 * once. Non-OK responses throw {@link ApiError}. Every helper takes an
 * optional trailing {@link RequestOptions} (`{ signal }`). Verb helpers unwrap
 * the response envelope's `data`; `getWithMeta` returns the full envelope,
 * `getText` returns the raw body text of a non-JSON endpoint, and `upload`
 * posts `FormData` without a JSON content type.
 */
export const api = {
  get: <T>(endpoint: string, opts?: RequestOptions) =>
    request<T>(endpoint, { method: 'GET', signal: opts?.signal }),
  getWithMeta: <T>(endpoint: string, opts?: RequestOptions) =>
    requestWithMeta<T>(endpoint, { method: 'GET', signal: opts?.signal }),
  getText: (endpoint: string, opts?: RequestOptions): Promise<string> =>
    requestText(endpoint, { method: 'GET', signal: opts?.signal }),
  post: <T, B = unknown>(endpoint: string, body: B, opts?: RequestOptions) =>
    request<T>(endpoint, { method: 'POST', body: JSON.stringify(body), signal: opts?.signal }),
  patch: <T, B = unknown>(endpoint: string, body: B, opts?: RequestOptions) =>
    request<T>(endpoint, { method: 'PATCH', body: JSON.stringify(body), signal: opts?.signal }),
  put: <T, B = unknown>(endpoint: string, body: B, opts?: RequestOptions) =>
    request<T>(endpoint, { method: 'PUT', body: JSON.stringify(body), signal: opts?.signal }),
  delete: <T>(endpoint: string, opts?: RequestOptions) =>
    request<T>(endpoint, { method: 'DELETE', signal: opts?.signal }),
  upload: <T>(endpoint: string, formData: FormData, opts?: RequestOptions) =>
    request<T>(endpoint, {
      method: 'POST',
      body: formData,
      headers: {} as Record<string, string>,
      signal: opts?.signal,
    }),
};
