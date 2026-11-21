import '../../test-setup.ts';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { config } from '../../config/index.ts';
import { HTML_BYTES, JPEG_1x1, makeJpeg } from '../../test-fixtures/images.ts';
import { InMemoryCacheProvider } from '../../utils/cache/index.ts';
import { setCacheProvider } from '../../utils/cache/singleton.ts';
import { LocalStorageDriver } from '../../utils/storage/local.ts';
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
 * Route tests for the photos router (`/api/v1/photos`).
 *
 * The harness (`test-helpers.ts`) mounts the REAL router behind a request-id
 * middleware and the global `errorHandler`, as `main.ts` does, so mapped and
 * unmapped errors produce the production envelopes. `GET /recipe/:recipeId` is
 * public and has no `zValidator('param')`, so both a valid-but-unknown UUID and
 * an invalid UUID return 200 with an empty array. `POST /` (multipart upload)
 * and `DELETE /:id` are auth-guarded → 401 without a Bearer token.
 *
 * Authenticated upload tests seed a user and a recipe through `@brewform/db`,
 * sign a real access token with `signAccessToken`, and write files to a
 * temporary `UPLOAD_DIR` (the local storage driver reads it at call time).
 */

/** Set a config value on the shared singleton (tests restore what they change). */
function setConfig(key: 'UPLOAD_DIR' | 'APP_ENV', value: string): void {
  // The config singleton is typed read-only from the schema; tests mutate it
  // in place and restore it afterwards.
  // biome-ignore lint/suspicious/noExplicitAny: test config mutation
  (config as any)[key] = value;
}

describe('Photo Routes — pre-auth & validation', () => {
  beforeEach(() => {
    setCacheProvider(new InMemoryCacheProvider());
  });

  afterEach(() => {
    setCacheProvider(new InMemoryCacheProvider());
  });

  describe('GET /api/v1/photos/recipe/:recipeId', () => {
    it('returns 200 with an empty array for a valid UUID with no photos', async () => {
      const app = createPhotoTestApp();
      const res = await app.request(`/api/v1/photos/recipe/${crypto.randomUUID()}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data).toHaveLength(0);
    });

    it('returns 200 with an empty array for an invalid UUID (DB query yields no rows)', async () => {
      const app = createPhotoTestApp();
      const res = await app.request('/api/v1/photos/recipe/not-a-uuid');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data).toHaveLength(0);
    });
  });

  describe('POST /api/v1/photos', () => {
    it('returns 401 when no Authorization header is present', async () => {
      const app = createPhotoTestApp();
      const form = new FormData();
      form.append('recipeId', crypto.randomUUID());
      form.append('file', new File([new Uint8Array([1, 2, 3])], 'test.png', { type: 'image/png' }));
      const res = await app.request('/api/v1/photos', {
        method: 'POST',
        body: form,
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('DELETE /api/v1/photos/:id', () => {
    it('returns 401 when no Authorization header is present', async () => {
      const app = createPhotoTestApp();
      const res = await app.request(`/api/v1/photos/${crypto.randomUUID()}`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });
});

describe('Photo Routes — authenticated upload', () => {
  let uploadDir: string;
  let originalUploadDir: string;
  let originalAppEnv: string;
  let originalDriver: StorageDriver;
  let author: PhotoAuthor;

  beforeAll(() => {
    originalUploadDir = config.UPLOAD_DIR;
    originalAppEnv = config.APP_ENV;
  });

  afterAll(() => {
    setConfig('UPLOAD_DIR', originalUploadDir);
  });

  beforeEach(async () => {
    setCacheProvider(new InMemoryCacheProvider());
    // A fresh throwaway UPLOAD_DIR per test, read by the local driver at call time.
    uploadDir = await mkdtemp(path.join(tmpdir(), 'brewform-photo-route-'));
    setConfig('UPLOAD_DIR', uploadDir);
    originalDriver = storageDeps.driver;
    storageDeps.driver = new LocalStorageDriver();
    author = await seedPhotoAuthor('photo-route');
  });

  afterEach(async () => {
    storageDeps.driver = originalDriver;
    setConfig('APP_ENV', originalAppEnv);
    await cleanupPhotoAuthor(author);
    await rm(uploadDir, { recursive: true, force: true });
    setCacheProvider(new InMemoryCacheProvider());
  });

  it.each(['a.x/%2e%2e/%2e%2e/other-bucket/payload', 'a.x/%2e%2e?policy='])(
    'stores a crafted filename (%s) under a server-generated UUID key',
    async (filename) => {
      const res = await postUpload(
        createPhotoTestApp(),
        author.token,
        buildUploadForm(author.recipeId, { bytes: JPEG_1x1, filename, type: 'image/jpeg' }),
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.url).toMatch(new RegExp(`^/uploads/${UUID_V4}\\.jpg$`));
      for (const forbidden of ['other-bucket', '%2e', '..', 'payload', 'policy']) {
        expect(body.data.url).not.toContain(forbidden);
      }
      expect(body.data.thumbnailUrl).toBe(body.data.url);
      expect(await readdir(uploadDir)).toEqual([path.basename(body.data.url)]);
    },
  );

  it('returns 415 UNSUPPORTED_MEDIA_TYPE for HTML bytes declared as a JPEG', async () => {
    const res = await postUpload(
      createPhotoTestApp(),
      author.token,
      buildUploadForm(author.recipeId, {
        bytes: HTML_BYTES,
        filename: 'holiday-at-home.jpg',
        type: 'image/jpeg',
      }),
    );

    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(body.error.details).toEqual([{ field: 'file', message: body.error.message }]);
    expect(await readdir(uploadDir)).toEqual([]);
  });

  it('returns 415 without echoing a hostile declared type', async () => {
    const res = await postUpload(
      createPhotoTestApp(),
      author.token,
      buildUploadForm(author.recipeId, {
        bytes: JPEG_1x1,
        filename: 'a.jpg',
        type: 'x-evil/<script>',
      }),
    );

    expect(res.status).toBe(415);
    const text = await res.text();
    expect(text).not.toContain('x-evil');
    expect(text).not.toContain('<script>');
  });

  it('returns 400 FILE_TOO_LARGE for an oversized thumbnail and stores nothing', async () => {
    const thumbnail = new Uint8Array(2 * 1024 * 1024);
    thumbnail.set(makeJpeg(100, 100));
    const res = await postUpload(
      createPhotoTestApp(),
      author.token,
      buildUploadForm(
        author.recipeId,
        { bytes: JPEG_1x1, filename: 'a.jpg' },
        { bytes: thumbnail, filename: 'thumb.jpg' },
      ),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('FILE_TOO_LARGE');
    expect(body.error.details[0].field).toBe('thumbnail');
    expect(await readdir(uploadDir)).toEqual([]);
  });

  it('returns 400 INVALID_IMAGE for a thumbnail over 1,200 px', async () => {
    const res = await postUpload(
      createPhotoTestApp(),
      author.token,
      buildUploadForm(
        author.recipeId,
        { bytes: JPEG_1x1, filename: 'a.jpg' },
        { bytes: makeJpeg(2000, 2000), filename: 'thumb.jpg' },
      ),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_IMAGE');
    expect(body.error.details[0].field).toBe('thumbnail');
  });

  it('keeps the 404 mapping for a missing recipe', async () => {
    const res = await postUpload(
      createPhotoTestApp(),
      author.token,
      buildUploadForm(crypto.randomUUID(), { bytes: JPEG_1x1, filename: 'a.jpg' }),
    );

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('NOT_FOUND');
  });

  it('hides storage errors in production behind 500 INTERNAL_ERROR', async () => {
    setConfig('APP_ENV', 'production');
    storageDeps.driver = {
      save: () =>
        Promise.reject(
          new Error(
            'HTTP 403: <Error><Code>AccessDenied</Code><Message>Access Denied</Message><BucketName>brewform-uploads</BucketName></Error>',
          ),
        ),
      delete: async () => {},
    };

    const res = await postUpload(
      createPhotoTestApp(),
      author.token,
      buildUploadForm(author.recipeId, { bytes: JPEG_1x1, filename: 'a.jpg' }),
    );

    expect(res.status).toBe(500);
    const text = await res.text();
    const body = JSON.parse(text);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('Something went wrong');
    expect(text).not.toContain('AccessDenied');
    expect(text).not.toContain('brewform-uploads');
  });

  it('never reads the multipart filename (a File whose name getter throws still uploads)', async () => {
    // Serialising such a File into a multipart body would itself read `name`
    // (undici's FormData encoder does), so the request hands the controller a
    // FormData holding the EvilFile directly through `Request.formData()`.
    class EvilFile extends File {
      get name(): string {
        throw new Error('name read');
      }
    }
    const form = new FormData();
    form.append('recipeId', author.recipeId);
    form.append(
      'file',
      new EvilFile([JPEG_1x1 as BlobPart], 'ignored.jpg', { type: 'image/jpeg' }),
    );
    expect(form.get('file')).toBeInstanceOf(EvilFile);
    const req = new Request('http://localhost/api/v1/photos', {
      method: 'POST',
      headers: { Authorization: `Bearer ${author.token}` },
    });
    Object.defineProperty(req, 'formData', { value: async () => form });

    const res = await createPhotoTestApp().request(req);

    expect(res.status).toBe(201);
    expect((await res.json()).data.url).toMatch(new RegExp(`^/uploads/${UUID_V4}\\.jpg$`));
  });

  it('never overwrites existing files whose names are used as upload filenames', async () => {
    const legacyKey = '1731000000000-abcd1234.jpeg';
    const otherUserKey = `${crypto.randomUUID()}.jpg`;
    const legacyBytes = crypto.getRandomValues(new Uint8Array(256));
    const otherBytes = crypto.getRandomValues(new Uint8Array(256));
    await writeFile(path.join(uploadDir, legacyKey), legacyBytes);
    await writeFile(path.join(uploadDir, otherUserKey), otherBytes);

    for (const filename of [legacyKey, otherUserKey]) {
      const res = await postUpload(
        createPhotoTestApp(),
        author.token,
        buildUploadForm(author.recipeId, { bytes: JPEG_1x1, filename }),
      );
      expect(res.status).toBe(201);
      const url: string = (await res.json()).data.url;
      expect(url).toMatch(new RegExp(`^/uploads/${UUID_V4}\\.jpg$`));
      expect(url).not.toBe(`/uploads/${filename}`);
    }

    expect(new Uint8Array(await readFile(path.join(uploadDir, legacyKey)))).toEqual(legacyBytes);
    expect(new Uint8Array(await readFile(path.join(uploadDir, otherUserKey)))).toEqual(otherBytes);
    expect(await readdir(uploadDir)).toHaveLength(4);
  });
});
