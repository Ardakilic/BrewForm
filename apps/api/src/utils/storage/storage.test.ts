import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
