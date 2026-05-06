import { config } from '../../config/index.ts';
import type { StorageDriver } from './types.ts';

export class S3StorageDriver implements StorageDriver {
  private endpoint: string;
  private region: string;
  private bucket: string;
  private accessKey: string;
  private secretKey: string;
  private publicUrl: string;

  constructor() {
    this.endpoint = config.S3_ENDPOINT!.replace(/\/$/, '');
    this.region = config.S3_REGION;
    this.bucket = config.S3_BUCKET!;
    this.accessKey = config.S3_ACCESS_KEY!;
    this.secretKey = config.S3_SECRET_KEY!;
    this.publicUrl = config.S3_PUBLIC_URL!.replace(/\/$/, '');
  }

  async save(data: Uint8Array, filename: string): Promise<string> {
    const key = `${this.bucket}/${filename}`;
    const url = `${this.endpoint}/${key}`;
    const headers = await this.signRequest('PUT', url, data, data.byteLength);
    const res = await this.fetchWithRetry(url, { method: 'PUT', headers, body: data as BodyInit });
    if (!res.ok) throw new Error(`S3 upload failed: ${res.status} ${res.statusText}`);
    return `${this.publicUrl}/${filename}`;
  }

  async delete(filename: string): Promise<void> {
    const key = `${this.bucket}/${filename}`;
    const url = `${this.endpoint}/${key}`;
    const headers = await this.signRequest('DELETE', url);
    const res = await this.fetchWithRetry(url, { method: 'DELETE', headers });
    if (!res.ok) throw new Error(`S3 delete failed: ${res.status} ${res.statusText}`);
  }

  private async fetchWithRetry(url: string, init: RequestInit, maxAttempts = 4): Promise<Response> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });

        if (res.ok) {
          return res;
        }

        const text = await res.text().catch(() => '');
        const isRetryable = res.status >= 500 || res.status === 503 || text.includes('SlowDown');

        if (!isRetryable) {
          return res;
        }

        lastError = new Error(`HTTP ${res.status}: ${text}`);

        if (attempt === maxAttempts - 1) {
          throw lastError;
        }
      } catch (err) {
        if (attempt === maxAttempts - 1) throw err;
        lastError = err instanceof Error ? err : new Error(String(err));
      }

      const delay = Math.min(1000 * 2 ** attempt, 8000);
      await new Promise((r) => setTimeout(r, delay));
    }

    throw lastError ?? new Error('Max retries exceeded');
  }

  private async signRequest(
    method: string,
    url: string,
    body?: Uint8Array,
    contentLength?: number,
  ): Promise<Headers> {
    const now = new Date();
    const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStamp = now.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    const parsedUrl = new URL(url);

    const payloadHash = body
      ? await this.sha256Hex(body)
      : 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

    const headers = new Headers();
    headers.set('host', parsedUrl.host);
    if (contentLength !== undefined) {
      headers.set('content-length', String(contentLength));
    }
    headers.set('x-amz-content-sha256', payloadHash);
    headers.set('x-amz-date', timeStamp);

    const signedHeaders = contentLength !== undefined
      ? 'content-length;host;x-amz-content-sha256;x-amz-date'
      : 'host;x-amz-content-sha256;x-amz-date';
    const canonicalHeaders = contentLength !== undefined
      ? `content-length:${contentLength}\nhost:${parsedUrl.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${timeStamp}\n`
      : `host:${parsedUrl.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${timeStamp}\n`;

    const canonicalRequest = [
      method,
      parsedUrl.pathname,
      parsedUrl.search.slice(1),
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

    headers.set(
      'authorization',
      `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    );

    return headers;
  }

  private async sha256Hex(data: Uint8Array): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', data as BufferSource);
    return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  private async hmacHex(key: CryptoKey, data: Uint8Array): Promise<string> {
    const sig = await crypto.subtle.sign('HMAC', key, data as BufferSource);
    return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  private async getSigningKey(dateStamp: string): Promise<CryptoKey> {
    const kDate = await this.hmac(
      new TextEncoder().encode('AWS4' + this.secretKey),
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
      [
        'sign',
      ],
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
