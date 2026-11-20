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

  it('should save a file and return a public URL', async () => {
    const data = new TextEncoder().encode('hello world');
    const url = await driver.save(data, 'test-file.txt');
    expect(url).toBe('/uploads/test-file.txt');

    const content = await readFile(`${testDir}/test-file.txt`, 'utf8');
    expect(content).toBe('hello world');
  });

  it('should delete a file', async () => {
    const data = new TextEncoder().encode('delete me');
    await driver.save(data, 'delete-me.txt');
    await driver.delete('delete-me.txt');

    const exists = await stat(`${testDir}/delete-me.txt`)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });

  it('should not throw when deleting a non-existent file', async () => {
    await expect(driver.delete('non-existent.txt')).resolves.toBeUndefined();
  });

  it('should reject path traversal in save', async () => {
    const data = new TextEncoder().encode('malicious');
    await expect(driver.save(data, '../../../etc/passwd')).rejects.toThrow('Invalid filename');
    await expect(driver.save(data, '/etc/passwd')).rejects.toThrow('Invalid filename');
  });

  it('should serve a file saved by the driver from GET /uploads/<file> in the same directory', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const url = await driver.save(bytes, 'served.png');
    expect(url).toBe('/uploads/served.png');

    const res = await app.request(url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
    // The handler read exactly what the driver wrote to the configured directory.
    expect(new Uint8Array(await readFile(`${testDir}/served.png`))).toEqual(bytes);
  });

  it('should answer 404 from GET /uploads/<file> for a file the driver never saved', async () => {
    const res = await app.request('/uploads/never-saved.png');
    expect(res.status).toBe(404);
  });

  it('should refuse encoded path traversal on GET /uploads/<path>', async () => {
    const res = await app.request('/uploads/..%2F..%2Fetc%2Fpasswd');
    expect(res.status).toBe(403);
  });

  it('should reject path traversal in delete', async () => {
    await expect(driver.delete('../../../etc/passwd')).rejects.toThrow('Invalid filename');
    await expect(driver.delete('/etc/passwd')).rejects.toThrow('Invalid filename');
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
