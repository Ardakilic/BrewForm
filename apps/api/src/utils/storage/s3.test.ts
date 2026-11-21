import '../../test-setup.ts';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { config } from '../../config/index.ts';
import { capturedRequest, verifySigV4 } from '../../test-fixtures/sigv4.ts';
import { log, S3StorageDriver } from './s3.ts';

/** S3 settings every test starts from (no real endpoint is ever contacted). */
const S3_TEST_CONFIG = {
  S3_ENDPOINT: 'https://s3.test',
  S3_REGION: 'auto',
  S3_BUCKET: 'test-bucket',
  S3_ACCESS_KEY: 'test-access-key',
  S3_SECRET_KEY: 'test-secret-key',
  S3_PUBLIC_URL: 'https://cdn.test',
} as const;

type S3ConfigKey = keyof typeof S3_TEST_CONFIG;

/** Overwrite one S3 setting on the shared config singleton. */
function setConfig(key: S3ConfigKey, value: string | undefined): void {
  // The config singleton is typed read-only from the schema; tests mutate it
  // in place (as storage.test.ts does) and restore it in afterEach.
  // biome-ignore lint/suspicious/noExplicitAny: test config mutation
  (config as any)[key] = value;
}

/** A key in the shape `generateStorageKey` produces. */
function generatedKey(ext = 'png'): string {
  return `${crypto.randomUUID()}.${ext}`;
}

const UNSAFE_KEYS = ['1-a.x/%2e%2e/%2e%2e/other-bucket/payload', 'abc.png?policy='];

describe('S3StorageDriver', () => {
  let original: Record<S3ConfigKey, string | undefined>;
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    original = Object.fromEntries(
      (Object.keys(S3_TEST_CONFIG) as S3ConfigKey[]).map((key) => [key, config[key]]),
    ) as Record<S3ConfigKey, string | undefined>;
    for (const [key, value] of Object.entries(S3_TEST_CONFIG)) {
      setConfig(key as S3ConfigKey, value);
    }
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(null, { status: 200 }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const [key, value] of Object.entries(original)) {
      setConfig(key as S3ConfigKey, value);
    }
  });

  describe('save', () => {
    it('sends exactly one PUT to /<bucket>/<key> with an empty query string', async () => {
      const key = generatedKey();
      const url = await new S3StorageDriver().save(new Uint8Array([1, 2, 3]), key, {
        contentType: 'image/png',
      });

      expect(url).toBe(`https://cdn.test/${key}`);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const request = capturedRequest(fetchSpy.mock.calls[0]);
      expect(request.method).toBe('PUT');
      const sent = new URL(request.url);
      expect(sent.origin).toBe('https://s3.test');
      expect(sent.pathname).toBe(`/test-bucket/${key}`);
      expect(sent.search).toBe('');
    });

    it('sends the caller-supplied content type and signs it', async () => {
      await new S3StorageDriver().save(new Uint8Array([1, 2, 3]), generatedKey(), {
        contentType: 'image/png',
      });

      const request = capturedRequest(fetchSpy.mock.calls[0]);
      expect(request.headers.get('content-type')).toBe('image/png');
      const signedHeaders = /SignedHeaders=([^,]+)/.exec(
        request.headers.get('authorization') ?? '',
      )?.[1];
      expect(signedHeaders?.split(';')).toContain('content-type');
      expect(signedHeaders).toBe(
        'content-length;content-type;host;x-amz-content-sha256;x-amz-date',
      );
    });

    it('signs exactly the sent path with an empty canonical query', async () => {
      const key = generatedKey('webp');
      await new S3StorageDriver().save(new Uint8Array([4, 5, 6]), key, {
        contentType: 'image/webp',
      });

      const check = verifySigV4(capturedRequest(fetchSpy.mock.calls[0]), 'test-secret-key');
      expect(check.valid).toBe(true);
      expect(check.canonicalQuery).toBe('');
      expect(check.canonicalRequest.split('\n')[1]).toBe(`/test-bucket/${key}`);
    });

    it.each(UNSAFE_KEYS)('refuses the unsafe key %j without calling fetch', async (key) => {
      await expect(
        new S3StorageDriver().save(new Uint8Array([1]), key, { contentType: 'image/png' }),
      ).rejects.toThrow('Invalid storage key');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('throws on a 403 without the response body, which only the server log receives', async () => {
      const body =
        '<Error><Code>AccessDenied</Code><Message>Access Denied</Message><BucketName>test-bucket</BucketName></Error>';
      fetchSpy.mockImplementation(async () => new Response(body, { status: 403 }));
      const errorSpy = vi.spyOn(log, 'error');

      const err = await new S3StorageDriver()
        .save(new Uint8Array([1]), generatedKey(), { contentType: 'image/png' })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toBe('S3 PUT failed with HTTP 403');
      expect((err as Error).message).not.toContain('AccessDenied');
      // A 403 is not retried.
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(errorSpy.mock.calls[0][0])).toContain('AccessDenied');
    });
  });

  describe('delete', () => {
    it('sends one DELETE to /<bucket>/<key> with an empty query and no content type', async () => {
      const key = generatedKey();
      await new S3StorageDriver().delete(key);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const request = capturedRequest(fetchSpy.mock.calls[0]);
      expect(request.method).toBe('DELETE');
      expect(new URL(request.url).pathname).toBe(`/test-bucket/${key}`);
      expect(new URL(request.url).search).toBe('');
      expect(request.headers.get('content-type')).toBeNull();
      expect(verifySigV4(request, 'test-secret-key').valid).toBe(true);
    });

    it.each(UNSAFE_KEYS)('refuses the unsafe key %j without calling fetch', async (key) => {
      await expect(new S3StorageDriver().delete(key)).rejects.toThrow('Invalid storage key');
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('required settings', () => {
    it('fails at construction when a required S3 setting is missing', () => {
      setConfig('S3_BUCKET', undefined);
      expect(() => new S3StorageDriver()).toThrow(
        'S3_BUCKET is required for the S3 storage driver',
      );
    });
  });

  describe('S3_ENDPOINT validation', () => {
    it.each([
      'https://s3.example.com/brewform-uploads',
      'https://s3.example.com/?x=1',
      'https://s3.example.com/#f',
    ])('rejects %s at construction with an error naming S3_ENDPOINT', (endpoint) => {
      setConfig('S3_ENDPOINT', endpoint);
      expect(() => new S3StorageDriver()).toThrow(
        'S3_ENDPOINT must be the account endpoint with no path, query or fragment',
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it.each(['https://s3.example.com', 'https://s3.example.com/'])(
      'accepts the account endpoint %s',
      async (endpoint) => {
        setConfig('S3_ENDPOINT', endpoint);
        const key = generatedKey();
        await new S3StorageDriver().save(new Uint8Array([1]), key, { contentType: 'image/png' });
        expect(new URL(capturedRequest(fetchSpy.mock.calls[0]).url).href).toBe(
          `https://s3.example.com/test-bucket/${key}`,
        );
      },
    );
  });
});
