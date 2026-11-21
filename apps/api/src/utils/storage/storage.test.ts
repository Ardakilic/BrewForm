import '../../test-setup.ts';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../main.ts';
import { LocalStorageDriver } from './local.ts';

describe('LocalStorageDriver', () => {
  const testDir = '/tmp/brewform-storage-test';
  let driver: LocalStorageDriver;
  let originalUploadDir: string;

  beforeEach(async () => {
    // Clean test directory
    try {
      await rm(testDir, { recursive: true });
    } catch {
      // ignore if doesn't exist
    }
    await mkdir(testDir, { recursive: true });

    // Override config.UPLOAD_DIR for testing
    const { config } = await import('../../config/index.ts');
    // biome-ignore lint/suspicious/noExplicitAny: test config mutation
    originalUploadDir = (config as any).UPLOAD_DIR;
    // biome-ignore lint/suspicious/noExplicitAny: test config mutation
    (config as any).UPLOAD_DIR = testDir;

    driver = new LocalStorageDriver();
  });

  afterEach(async () => {
    // Restore original config.UPLOAD_DIR
    const { config } = await import('../../config/index.ts');
    // biome-ignore lint/suspicious/noExplicitAny: test config mutation
    (config as any).UPLOAD_DIR = originalUploadDir;

    // Clean up test directory
    try {
      await rm(testDir, { recursive: true });
    } catch {
      // ignore if doesn't exist
    }
  });

  /** A safe key in the shape the server generates (`<uuid>.<ext>`). */
  const key = (ext = 'jpg') => `${crypto.randomUUID()}.${ext}`;

  it('should save a file and return a public URL', async () => {
    const data = new TextEncoder().encode('hello world');
    const name = key('png');
    const url = await driver.save(data, name, { contentType: 'image/png' });
    expect(url).toBe(`/uploads/${name}`);

    const content = await readFile(`${testDir}/${name}`, 'utf8');
    expect(content).toBe('hello world');
  });

  it('should accept a legacy timestamp key', async () => {
    const data = new TextEncoder().encode('legacy');
    const url = await driver.save(data, '1731000000000-abcd1234.jpeg', {
      contentType: 'image/jpeg',
    });
    expect(url).toBe('/uploads/1731000000000-abcd1234.jpeg');
  });

  it('should delete a file', async () => {
    const data = new TextEncoder().encode('delete me');
    const name = key();
    await driver.save(data, name, { contentType: 'image/jpeg' });
    await driver.delete(name);

    const exists = await stat(`${testDir}/${name}`)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });

  it('should not throw when deleting a non-existent file', async () => {
    await expect(driver.delete(key())).resolves.toBeUndefined();
  });

  it('should reject path traversal in save', async () => {
    const data = new TextEncoder().encode('malicious');
    const options = { contentType: 'image/jpeg' };
    await expect(driver.save(data, '../../../etc/passwd', options)).rejects.toThrow(
      'Invalid storage key',
    );
    await expect(driver.save(data, '/etc/passwd', options)).rejects.toThrow('Invalid storage key');
  });

  it('should reject a nested key without creating any file or directory', async () => {
    const data = new TextEncoder().encode('nested');
    await rm(testDir, { recursive: true, force: true });

    await expect(
      driver.save(data, 'abc.x/sub/evil', { contentType: 'image/jpeg' }),
    ).rejects.toThrow('Invalid storage key');

    // The key guard runs before mkdir: not even UPLOAD_DIR itself was created.
    const dirExists = await stat(testDir)
      .then(() => true)
      .catch(() => false);
    expect(dirExists).toBe(false);
  });

  it('should never replace an existing file (exclusive create)', async () => {
    const name = key();
    const first = new TextEncoder().encode('first bytes');
    await driver.save(first, name, { contentType: 'image/jpeg' });

    await expect(
      driver.save(new TextEncoder().encode('second'), name, { contentType: 'image/jpeg' }),
    ).rejects.toMatchObject({ code: 'EEXIST' });

    expect(await readFile(`${testDir}/${name}`, 'utf8')).toBe('first bytes');
  });

  it('should serve a file saved by the driver from GET /uploads/<file> in the same directory', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const name = key('png');
    const url = await driver.save(bytes, name, { contentType: 'image/png' });
    expect(url).toBe(`/uploads/${name}`);

    const res = await app.request(url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
    // The handler read exactly what the driver wrote to the configured directory.
    expect(new Uint8Array(await readFile(`${testDir}/${name}`))).toEqual(bytes);
  });

  it('should answer 404 from GET /uploads/<file> for a file the driver never saved', async () => {
    const res = await app.request('/uploads/never-saved.png');
    expect(res.status).toBe(404);
  });

  it('should refuse encoded path traversal on GET /uploads/<path>', async () => {
    const res = await app.request('/uploads/..%2F..%2Fetc%2Fpasswd');
    expect(res.status).toBe(403);
  });

  it('streams a large file in chunks of at most 64 KiB', async () => {
    const bytes = new Uint8Array(300 * 1024);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
    const url = await driver.save(bytes, key('webp'), { contentType: 'image/webp' });

    const res = await app.request(url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    const body = res.body;
    expect(body).not.toBeNull();
    if (!body) return;
    const reader = body.getReader();
    try {
      const first = await reader.read();
      expect(first.done).toBe(false);
      expect(first.value?.byteLength ?? 0).toBeGreaterThan(0);
      expect(first.value?.byteLength ?? 0).toBeLessThanOrEqual(64 * 1024);
      const chunks: Uint8Array[] = first.value ? [first.value] : [];
      for (let next = await reader.read(); !next.done; next = await reader.read()) {
        chunks.push(next.value);
      }
      expect(chunks.length).toBeGreaterThan(1);
      expect(Buffer.concat(chunks).equals(Buffer.from(bytes))).toBe(true);
    } finally {
      await reader.cancel();
    }
  });

  it('marks a successful upload read as immutable for a year, with nosniff', async () => {
    const url = await driver.save(new Uint8Array([1, 2, 3]), key('png'), {
      contentType: 'image/png',
    });

    const res = await app.request(url);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    await res.arrayBuffer();
  });

  it('answers HEAD with the headers only', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 4, 5, 6, 7, 8]);
    const url = await driver.save(bytes, key('png'), { contentType: 'image/png' });

    const res = await app.request(url, { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-length')).toBe(String(bytes.byteLength));
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(await res.text()).toBe('');
  });

  it('answers 404 for a path with a null byte', async () => {
    const res = await app.request('/uploads/a%00.png');
    expect(res.status).toBe(404);
  });

  it('answers 404 for a directory', async () => {
    await mkdir(`${testDir}/dir.png`);
    const res = await app.request('/uploads/dir.png');
    expect(res.status).toBe(404);
  });

  it('sends no cache-control header with a 403 or a 404', async () => {
    const forbidden = await app.request('/uploads/..%2F..%2Fetc%2Fpasswd');
    expect(forbidden.status).toBe(403);
    expect(forbidden.headers.get('cache-control')).toBeNull();
    const missing = await app.request('/uploads/never-saved.png');
    expect(missing.status).toBe(404);
    expect(missing.headers.get('cache-control')).toBeNull();
  });

  it('should reject path traversal in delete', async () => {
    await expect(driver.delete('../../../etc/passwd')).rejects.toThrow('Invalid storage key');
    await expect(driver.delete('/etc/passwd')).rejects.toThrow('Invalid storage key');
    await expect(driver.delete('abc.x/sub/evil')).rejects.toThrow('Invalid storage key');
  });
});

describe('createStorageDriver', () => {
  it('should create LocalStorageDriver for local driver', async () => {
    const { createStorageDriver } = await import('./index.ts');
    const { config } = await import('../../config/index.ts');
    const originalDriver = config.STORAGE_DRIVER;
    // biome-ignore lint/suspicious/noExplicitAny: test config mutation
    (config as any).STORAGE_DRIVER = 'local';

    const driver = createStorageDriver();
    expect(driver).toBeInstanceOf(LocalStorageDriver);

    // biome-ignore lint/suspicious/noExplicitAny: test config mutation
    (config as any).STORAGE_DRIVER = originalDriver;
  });

  it('should create S3StorageDriver for s3 driver', async () => {
    const { createStorageDriver } = await import('./index.ts');
    const { S3StorageDriver } = await import('./s3.ts');
    const { config } = await import('../../config/index.ts');
    const originalDriver = config.STORAGE_DRIVER;
    // biome-ignore lint/suspicious/noExplicitAny: test config mutation
    const originalEndpoint = (config as any).S3_ENDPOINT;
    // biome-ignore lint/suspicious/noExplicitAny: test config mutation
    const originalBucket = (config as any).S3_BUCKET;
    // biome-ignore lint/suspicious/noExplicitAny: test config mutation
    const originalAccessKey = (config as any).S3_ACCESS_KEY;
    // biome-ignore lint/suspicious/noExplicitAny: test config mutation
    const originalSecretKey = (config as any).S3_SECRET_KEY;
    // biome-ignore lint/suspicious/noExplicitAny: test config mutation
    const originalPublicUrl = (config as any).S3_PUBLIC_URL;
    // biome-ignore lint/suspicious/noExplicitAny: test config mutation
    (config as any).STORAGE_DRIVER = 's3';
    // biome-ignore lint/suspicious/noExplicitAny: test config mutation
    (config as any).S3_ENDPOINT = 'https://s3.example.com';
    // biome-ignore lint/suspicious/noExplicitAny: test config mutation
    (config as any).S3_BUCKET = 'test-bucket';
    // biome-ignore lint/suspicious/noExplicitAny: test config mutation
    (config as any).S3_ACCESS_KEY = 'test-access-key';
    // biome-ignore lint/suspicious/noExplicitAny: test config mutation
    (config as any).S3_SECRET_KEY = 'test-secret-key';
    // biome-ignore lint/suspicious/noExplicitAny: test config mutation
    (config as any).S3_PUBLIC_URL = 'https://cdn.example.com';

    const driver = createStorageDriver();
    expect(driver).toBeInstanceOf(S3StorageDriver);

    // biome-ignore lint/suspicious/noExplicitAny: test config mutation
    (config as any).STORAGE_DRIVER = originalDriver;
    // biome-ignore lint/suspicious/noExplicitAny: test config mutation
    (config as any).S3_ENDPOINT = originalEndpoint;
    // biome-ignore lint/suspicious/noExplicitAny: test config mutation
    (config as any).S3_BUCKET = originalBucket;
    // biome-ignore lint/suspicious/noExplicitAny: test config mutation
    (config as any).S3_ACCESS_KEY = originalAccessKey;
    // biome-ignore lint/suspicious/noExplicitAny: test config mutation
    (config as any).S3_SECRET_KEY = originalSecretKey;
    // biome-ignore lint/suspicious/noExplicitAny: test config mutation
    (config as any).S3_PUBLIC_URL = originalPublicUrl;
  });
});
