import '../../test-setup.ts';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { config, reloadConfig } from '../../config/env.ts';
import { JPEG_1x1, PNG_1x1 } from '../../test-fixtures/images.ts';
import { capturedRequest, verifySigV4 } from '../../test-fixtures/sigv4.ts';
import { InMemoryCacheProvider } from '../../utils/cache/index.ts';
import { setCacheProvider } from '../../utils/cache/singleton.ts';
import { S3StorageDriver } from '../../utils/storage/s3.ts';
import type { StorageDriver } from '../../utils/storage/types.ts';
import { storageDeps } from '../../utils/upload/index.ts';
import {
  buildUploadForm,
  cleanupPhotoAuthor,
  createPhotoTestApp,
  type PhotoAuthor,
  postUpload,
  seedPhotoAuthor,
  UUID_V4,
} from './test-helpers.ts';

/**
 * End-to-end request-integrity test for photo uploads through the S3 driver
 * (ADR-019): crafted multipart filenames that once produced signed
 * bucket-subresource requests, cross-bucket writes or overwrites must now
 * produce only `PUT /<bucket>/<uuid>.<ext>` requests with an empty query,
 * signed with an empty canonical query string. `fetch` is mocked; no network.
 */

/** Config values the S3 driver reads during these tests. */
const S3_TEST_CONFIG = {
  STORAGE_DRIVER: 's3',
  S3_ENDPOINT: 'https://s3.test',
  S3_REGION: 'auto',
  S3_BUCKET: 'test-bucket',
  S3_ACCESS_KEY: 'test-access-key',
  S3_SECRET_KEY: 'test-secret-key',
  S3_PUBLIC_URL: 'https://cdn.test',
} as const;

type TestConfigKey = keyof typeof S3_TEST_CONFIG;

/** Overwrite one setting on the shared config singleton. */
function setConfig(key: TestConfigKey, value: string | undefined): void {
  // The config singleton is typed read-only from the schema; tests mutate it
  // in place and restore it in afterEach.
  // biome-ignore lint/suspicious/noExplicitAny: test config mutation
  (config as any)[key] = value;
}

/** Signed object path: `/<bucket>/<uuid>[_medium].<ext>`. */
const OBJECT_PATH_RE = new RegExp(`^/test-bucket/(${UUID_V4})(_medium)?\\.(jpg|png|webp)$`);

const CRAFTED_FILENAMES = [
  'a.x/%2e%2e?policy=',
  'a.x/%2e%2e?cors=',
  'a.x?acl=',
  'a.x?tagging=',
  'a.x?uploads=',
  'a.x?partNumber=1&uploadId=1',
  'a.x/%2e%2e/%2e%2e/other-bucket/payload',
  '../1731000000000-abcd1234.jpeg',
];

describe('Photo upload through the S3 driver — request integrity', () => {
  let original: Record<TestConfigKey, string | undefined>;
  let originalDriver: StorageDriver;
  let fetchSpy: MockInstance<typeof fetch>;
  let author: PhotoAuthor;

  beforeEach(async () => {
    setCacheProvider(new InMemoryCacheProvider());
    original = Object.fromEntries(
      (Object.keys(S3_TEST_CONFIG) as TestConfigKey[]).map((key) => [key, config[key]]),
    ) as Record<TestConfigKey, string | undefined>;
    for (const [key, value] of Object.entries(S3_TEST_CONFIG)) {
      setConfig(key as TestConfigKey, value);
    }
    originalDriver = storageDeps.driver;
    storageDeps.driver = new S3StorageDriver();
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(null, { status: 200 }));
    author = await seedPhotoAuthor('photo-s3');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    storageDeps.driver = originalDriver;
    for (const [key, value] of Object.entries(original)) {
      setConfig(key as TestConfigKey, value);
    }
    await cleanupPhotoAuthor(author);
    setCacheProvider(new InMemoryCacheProvider());
  });

  it.each(CRAFTED_FILENAMES)(
    'uploads %j as a plain object PUT under generated keys',
    async (filename) => {
      const res = await postUpload(
        createPhotoTestApp(),
        author.token,
        buildUploadForm(
          author.recipeId,
          { bytes: PNG_1x1, filename, type: 'image/png' },
          { bytes: JPEG_1x1, filename, type: 'image/jpeg' },
        ),
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      const keysInResponse = [body.data.url, body.data.thumbnailUrl].map((url: string) =>
        new URL(url).pathname.slice(1),
      );

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const sentKeys: string[] = [];
      for (const call of fetchSpy.mock.calls) {
        const request = capturedRequest(call);
        const url = new URL(request.url);
        expect(request.method).toBe('PUT');
        expect(url.origin).toBe('https://s3.test');
        expect(url.pathname).toMatch(OBJECT_PATH_RE);
        expect(url.search).toBe('');
        expect(url.pathname).not.toBe('/test-bucket/');
        expect(url.pathname).not.toContain('/other-bucket/');

        const check = verifySigV4(request, 'test-secret-key');
        expect(check.valid).toBe(true);
        expect(check.canonicalQuery).toBe('');
        expect(check.canonicalRequest.split('\n')[2]).toBe('');
        expect(check.signedHeaders).toContain('content-type');
        sentKeys.push(url.pathname.replace('/test-bucket/', ''));
      }

      // Both objects share one UUID, take their own detected types, and are the
      // keys returned to the client (generated in this request, never derived
      // from the filename).
      const [originalKey, thumbKey] = sentKeys;
      const id = OBJECT_PATH_RE.exec(`/test-bucket/${originalKey}`)?.[1];
      expect(originalKey).toBe(`${id}.png`);
      expect(thumbKey).toBe(`${id}_medium.jpg`);
      expect(keysInResponse).toEqual(sentKeys);
      expect(capturedRequest(fetchSpy.mock.calls[0]).headers.get('content-type')).toBe('image/png');
      expect(capturedRequest(fetchSpy.mock.calls[1]).headers.get('content-type')).toBe(
        'image/jpeg',
      );
    },
  );

  it('gives two uploads of the same filename different keys', async () => {
    const urls: string[] = [];
    for (let i = 0; i < 2; i++) {
      const res = await postUpload(
        createPhotoTestApp(),
        author.token,
        buildUploadForm(author.recipeId, { bytes: JPEG_1x1, filename: 'photo.jpg' }),
      );
      expect(res.status).toBe(201);
      urls.push((await res.json()).data.url);
    }
    expect(urls[0]).not.toBe(urls[1]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('stores URLs with one slash when S3_PUBLIC_URL ends with a slash', async () => {
    // Go through the env loader so its trailing-slash normalisation runs.
    const env = { ...S3_TEST_CONFIG, S3_PUBLIC_URL: 'https://cdn.test/' };
    const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
    Object.assign(process.env, env);
    reloadConfig();
    try {
      storageDeps.driver = new S3StorageDriver();
      const res = await postUpload(
        createPhotoTestApp(),
        author.token,
        buildUploadForm(
          author.recipeId,
          { bytes: PNG_1x1, filename: 'photo.png', type: 'image/png' },
          { bytes: JPEG_1x1, filename: 'thumb.jpg', type: 'image/jpeg' },
        ),
      );
      expect(res.status).toBe(201);
      const { url, thumbnailUrl } = (await res.json()).data;
      expect(url).toMatch(new RegExp(`^https://cdn\\.test/${UUID_V4}\\.(jpg|png)$`));
      expect(thumbnailUrl).toMatch(
        new RegExp(`^https://cdn\\.test/${UUID_V4}_medium\\.(jpg|png)$`),
      );
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      reloadConfig();
    }
  });
});
