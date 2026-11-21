/**
 * Test-only AWS Signature V4 verifier for requests captured from a mocked
 * `fetch`. It rebuilds the canonical request from what was actually sent (the
 * URL and headers) and recomputes the signature with the test secret, so a
 * test can prove exactly which method, path and query string were signed.
 */
import { createHash, createHmac } from 'node:crypto';

/** The parts of a captured request needed to verify its signature. */
export interface CapturedRequest {
  method: string;
  url: string;
  headers: Headers;
}

/** The outcome of {@link verifySigV4}. */
export interface SigV4Check {
  /** The canonical request rebuilt from the sent URL and headers. */
  canonicalRequest: string;
  /** Line 3 of the canonical request (the canonical query string). */
  canonicalQuery: string;
  /** Header names listed in the `SignedHeaders` component of `authorization`. */
  signedHeaders: string[];
  /** True when the recomputed signature equals the one that was sent. */
  valid: boolean;
}

/** Hex-encoded SHA-256 of `data`. */
function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

/** HMAC-SHA256 of `data` with `key`. */
function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

/** Parse the `authorization` header into credential scope, signed headers and signature. */
function parseAuthorization(value: string) {
  const match =
    /^AWS4-HMAC-SHA256 Credential=[^/]+\/(\d{8})\/([^/]+)\/s3\/aws4_request, SignedHeaders=([a-z0-9;-]+), Signature=([0-9a-f]{64})$/.exec(
      value,
    );
  if (!match) throw new Error('authorization header is not an AWS4-HMAC-SHA256 header');
  const [, date, region, signedHeaders, signature] = match;
  return { date, region, signedHeaders: signedHeaders.split(';'), signature };
}

/**
 * Rebuild the SigV4 canonical request of a captured S3 request and check its
 * signature against `secretKey`.
 *
 * @param request - The method, URL and headers passed to `fetch`.
 * @param secretKey - The S3 secret key the driver was configured with.
 */
export function verifySigV4(request: CapturedRequest, secretKey: string): SigV4Check {
  const url = new URL(request.url);
  const auth = parseAuthorization(request.headers.get('authorization') ?? '');
  const canonicalHeaders = auth.signedHeaders
    .map((name) => {
      const value = request.headers.get(name) ?? (name === 'host' ? url.host : '');
      return `${name}:${value.trim()}\n`;
    })
    .join('');
  const canonicalQuery = url.search.slice(1);
  const canonicalRequest = [
    request.method,
    url.pathname,
    canonicalQuery,
    canonicalHeaders,
    auth.signedHeaders.join(';'),
    request.headers.get('x-amz-content-sha256') ?? '',
  ].join('\n');
  const scope = `${auth.date}/${auth.region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    request.headers.get('x-amz-date') ?? '',
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${secretKey}`, auth.date), auth.region), 's3'),
    'aws4_request',
  );
  const expected = hmac(signingKey, stringToSign).toString('hex');
  return {
    canonicalRequest,
    canonicalQuery,
    signedHeaders: auth.signedHeaders,
    valid: expected === auth.signature,
  };
}

/**
 * Normalise one recorded `fetch` call (`[input, init]`) into a {@link CapturedRequest}.
 *
 * @param call - The arguments recorded by a `vi.spyOn(globalThis, 'fetch')` mock.
 */
export function capturedRequest(call: unknown[]): CapturedRequest {
  const [input, init] = call as [string | URL | Request, RequestInit | undefined];
  const url = input instanceof Request ? input.url : String(input);
  return {
    method: init?.method ?? (input instanceof Request ? input.method : 'GET'),
    url,
    headers: new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)),
  };
}
