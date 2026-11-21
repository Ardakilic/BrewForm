import { config } from '../../config/index.ts';
import { createLogger } from '../logger/index.ts';
import { assertSafeStorageKey } from './key.ts';
import type { StorageDriver } from './types.ts';

/** Module-scoped structured logger (exported for test spies). */
export const log = createLogger('s3-storage');

/** SHA-256 of an empty payload (DELETE requests). */
const EMPTY_PAYLOAD_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

/** Most characters of an S3 error body copied into a log entry. */
const MAX_LOGGED_BODY_CHARS = 2048;

/** Error thrown when `S3_ENDPOINT` carries a path, query or fragment. */
const ENDPOINT_ERROR = 'S3_ENDPOINT must be the account endpoint with no path, query or fragment';

/** A request target: the URL sent to `fetch` and the exact path that is signed. */
interface S3Target {
  url: URL;
  path: string;
}

/**
 * Parse `S3_ENDPOINT` and return it without a trailing `/`.
 *
 * @throws {Error} {@link ENDPOINT_ERROR} when the value is not a URL or has a
 *   path (for example a bucket path), a query or a fragment.
 */
function parseEndpoint(raw: string | undefined): string {
  let parsed: URL;
  try {
    parsed = new URL(raw ?? '');
  } catch {
    throw new Error(ENDPOINT_ERROR);
  }
  if ((parsed.pathname !== '' && parsed.pathname !== '/') || parsed.search || parsed.hash) {
    throw new Error(ENDPOINT_ERROR);
  }
  return (raw ?? '').replace(/\/$/, '');
}

/**
 * Return a required S3 setting, failing loudly when it is unset (the env
 * schema already requires these when `STORAGE_DRIVER=s3`).
 *
 * @throws {Error} `<name> is required for the S3 storage driver`.
 */
function requireSetting(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is required for the S3 storage driver`);
  return value;
}

/**
 * StorageDriver for any S3-compatible endpoint, using hand-rolled AWS
 * Signature V4 signing over plain fetch (no SDK dependency). Requests time
 * out after 30s and transient failures (5xx / SlowDown) are retried with
 * exponential backoff, re-sending the same request to the same key.
 * save() returns a URL built from S3_PUBLIC_URL.
 *
 * Request integrity (ADR-019): every key passes `assertSafeStorageKey`; the
 * path `/<bucket>/<key>` is URI-encoded once per SigV4 rules and signed as the
 * canonical URI with an empty canonical query; the request is aborted if the
 * parsed URL differs from what was signed. PUTs carry a signed `content-type`.
 */
export class S3StorageDriver implements StorageDriver {
  private endpoint: string;
  private region: string;
  private bucket: string;
  private accessKey: string;
  private secretKey: string;
  private publicUrl: string;

  /**
   * Read the S3 settings from config.
   *
   * @throws {Error} When `S3_ENDPOINT` has a path, query or fragment, or a
   *   required S3 setting is missing (config validation normally prevents that).
   */
  constructor() {
    this.endpoint = parseEndpoint(config.S3_ENDPOINT);
    this.region = config.S3_REGION;
    this.bucket = requireSetting('S3_BUCKET', config.S3_BUCKET);
    this.accessKey = requireSetting('S3_ACCESS_KEY', config.S3_ACCESS_KEY);
    this.secretKey = requireSetting('S3_SECRET_KEY', config.S3_SECRET_KEY);
    this.publicUrl = requireSetting('S3_PUBLIC_URL', config.S3_PUBLIC_URL);
  }

  /**
   * Upload `data` as `<bucket>/<key>` with the caller-supplied content type.
   *
   * @param data - Object bytes.
   * @param key - A flat, server-generated key.
   * @param options - `contentType` is sent and signed as `content-type`.
   * @returns `<S3_PUBLIC_URL>/<key>`.
   * @throws {Error} `Invalid storage key` before any request, or
   *   `S3 PUT failed with HTTP <status>` (the response body is only logged).
   */
  async save(data: Uint8Array, key: string, options: { contentType: string }): Promise<string> {
    log.debug({ key }, 'save started');
    const target = this.buildTarget(key);
    const headers = await this.signRequest('PUT', target, data, options.contentType);
    await this.fetchWithRetry('PUT', key, target, {
      method: 'PUT',
      headers,
      body: data as BodyInit,
    });
    log.debug({ key }, 'save completed');
    return `${this.publicUrl}/${key}`;
  }

  /**
   * Delete `<bucket>/<key>`.
   *
   * @param key - A flat, server-generated key.
   * @throws {Error} `Invalid storage key` before any request, or
   *   `S3 DELETE failed with HTTP <status>`.
   */
  async delete(key: string): Promise<void> {
    log.debug({ key }, 'delete started');
    const target = this.buildTarget(key);
    const headers = await this.signRequest('DELETE', target);
    await this.fetchWithRetry('DELETE', key, target, { method: 'DELETE', headers });
    log.debug({ key }, 'delete completed');
  }

  /**
   * Percent-encode every byte of `segment` except the SigV4 unreserved set
   * (`A-Z a-z 0-9 - . _ ~`), once (S3 paths are never double-encoded).
   */
  private uriEncode(segment: string): string {
    let encoded = '';
    for (const byte of new TextEncoder().encode(segment)) {
      const char = String.fromCharCode(byte);
      encoded += /[A-Za-z0-9\-._~]/.test(char)
        ? char
        : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
    }
    return encoded;
  }

  /**
   * Build the request target for `key`: the encoded path `/<bucket>/<key>`
   * and the URL that will be sent.
   *
   * @throws {Error} `Invalid storage key` on an unsafe key, or when the URL
   *   parser would send a different path or any query/fragment than the
   *   signed path.
   */
  private buildTarget(key: string): S3Target {
    assertSafeStorageKey(key);
    const path = `/${this.uriEncode(this.bucket)}/${key
      .split('/')
      .map((s) => this.uriEncode(s))
      .join('/')}`;
    const url = new URL(this.endpoint + path);
    if (url.pathname !== path || url.search !== '' || url.hash !== '') {
      throw new Error('S3 request target does not match the signed path');
    }
    return { url, path };
  }

  /**
   * Send a signed request, retrying transient failures (network errors, 5xx,
   * SlowDown) up to `maxAttempts` times with exponential backoff.
   *
   * @throws {Error} `S3 <method> failed with HTTP <status>` on a final non-2xx
   *   response (its body goes to the error log only), or the last network error.
   */
  private async fetchWithRetry(
    method: 'PUT' | 'DELETE',
    key: string,
    target: S3Target,
    init: RequestInit,
    maxAttempts = 4,
  ): Promise<Response> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const isLast = attempt === maxAttempts;
      let res: Response | undefined;
      let networkError: unknown;
      try {
        res = await fetch(target.url.href, { ...init, signal: AbortSignal.timeout(30_000) });
      } catch (err) {
        networkError = err;
      }

      if (res?.ok) return res;

      if (res) {
        const body = (await res.text().catch(() => '')).slice(0, MAX_LOGGED_BODY_CHARS);
        const retryable = res.status >= 500 || body.includes('SlowDown');
        const context = { key, method, status: res.status, attempt, body };
        if (!retryable || isLast) {
          const err = new Error(`S3 ${method} failed with HTTP ${res.status}`);
          log.error({ err, ...context }, 'S3 request failed');
          throw err;
        }
        log.warn(context, 'S3 request failed; retrying');
      } else {
        if (isLast) {
          log.error({ err: networkError, key, method, attempt }, 'S3 request failed');
          throw networkError;
        }
        log.warn({ err: networkError, key, method, attempt }, 'S3 request failed; retrying');
      }

      const delay = Math.min(1000 * 2 ** (attempt - 1), 8000);
      await new Promise((r) => setTimeout(r, delay));
    }
    throw new Error(`S3 ${method} failed: retries exhausted`);
  }

  /**
   * Build the SigV4 headers for a request to `target`. The canonical URI is
   * `target.path` exactly and the canonical query string is empty; PUTs sign
   * `content-length` and `content-type` in addition to `host`,
   * `x-amz-content-sha256` and `x-amz-date` (header names sorted).
   */
  private async signRequest(
    method: 'PUT' | 'DELETE',
    target: S3Target,
    body?: Uint8Array,
    contentType?: string,
  ): Promise<Headers> {
    const now = new Date();
    const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStamp = `${now.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
    const payloadHash = body ? await this.sha256Hex(body) : EMPTY_PAYLOAD_SHA256;

    const entries: Array<[string, string]> = [];
    if (body) entries.push(['content-length', String(body.byteLength)]);
    if (contentType !== undefined) entries.push(['content-type', contentType.trim()]);
    entries.push(['host', target.url.host]);
    entries.push(['x-amz-content-sha256', payloadHash]);
    entries.push(['x-amz-date', timeStamp]);
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

    const signedHeaders = entries.map(([name]) => name).join(';');
    const canonicalHeaders = entries.map(([name, value]) => `${name}:${value}\n`).join('');
    const canonicalRequest = [
      method,
      target.path,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      timeStamp,
      credentialScope,
      await this.sha256Hex(new TextEncoder().encode(canonicalRequest)),
    ].join('\n');

    const signingKey = await this.getSigningKey(dateStamp);
    const signature = await this.hmacHex(signingKey, new TextEncoder().encode(stringToSign));

    const headers = new Headers(entries);
    headers.set(
      'authorization',
      `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    );
    return headers;
  }

  private async sha256Hex(data: Uint8Array): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', data as BufferSource);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private async hmacHex(key: CryptoKey, data: Uint8Array): Promise<string> {
    const sig = await crypto.subtle.sign('HMAC', key, data as BufferSource);
    return Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private async getSigningKey(dateStamp: string): Promise<CryptoKey> {
    const kDate = await this.hmac(
      new TextEncoder().encode(`AWS4${this.secretKey}`),
      new TextEncoder().encode(dateStamp),
    );
    const kRegion = await this.hmac(kDate, new TextEncoder().encode(this.region));
    const kService = await this.hmac(kRegion, new TextEncoder().encode('s3'));
    const kSigning = await this.hmac(kService, new TextEncoder().encode('aws4_request'));
    return await crypto.subtle.importKey(
      'raw',
      kSigning as BufferSource,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  }

  private async hmac(key: ArrayBuffer | Uint8Array, data: Uint8Array): Promise<ArrayBuffer> {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key as BufferSource,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    return await crypto.subtle.sign('HMAC', cryptoKey, data as BufferSource);
  }
}
