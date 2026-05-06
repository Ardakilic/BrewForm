import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { LocalStorageDriver } from './local.ts';

describe('LocalStorageDriver', () => {
  const testDir = '/tmp/brewform-storage-test';
  let driver: LocalStorageDriver;
  let originalUploadDir: string;

  beforeEach(async () => {
    // Clean test directory
    try {
      await Deno.remove(testDir, { recursive: true });
    } catch {
      // ignore if doesn't exist
    }
    await Deno.mkdir(testDir, { recursive: true });

    // Override config.UPLOAD_DIR for testing
    const { config } = await import('../../config/index.ts');
    originalUploadDir = (config as any).UPLOAD_DIR;
    (config as any).UPLOAD_DIR = testDir;

    driver = new LocalStorageDriver();
  });

  afterEach(async () => {
    // Restore original config.UPLOAD_DIR
    const { config } = await import('../../config/index.ts');
    (config as any).UPLOAD_DIR = originalUploadDir;

    // Clean up test directory
    try {
      await Deno.remove(testDir, { recursive: true });
    } catch {
      // ignore if doesn't exist
    }
  });

  it('should save a file and return a public URL', async () => {
    const data = new TextEncoder().encode('hello world');
    const url = await driver.save(data, 'test-file.txt');
    expect(url).toBe('/uploads/test-file.txt');

    const content = await Deno.readTextFile(`${testDir}/test-file.txt`);
    expect(content).toBe('hello world');
  });

  it('should delete a file', async () => {
    const data = new TextEncoder().encode('delete me');
    await driver.save(data, 'delete-me.txt');
    await driver.delete('delete-me.txt');

    const exists = await Deno.stat(`${testDir}/delete-me.txt`).then(() => true).catch(() => false);
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
    (config as any).STORAGE_DRIVER = 'local';

    const driver = createStorageDriver();
    expect(driver).toBeInstanceOf(LocalStorageDriver);

    (config as any).STORAGE_DRIVER = originalDriver;
  });

  it('should create S3StorageDriver for s3 driver', async () => {
    const { createStorageDriver } = await import('./index.ts');
    const { S3StorageDriver } = await import('./s3.ts');
    const { config } = await import('../../config/index.ts');
    const originalDriver = config.STORAGE_DRIVER;
    const originalEndpoint = (config as any).S3_ENDPOINT;
    const originalBucket = (config as any).S3_BUCKET;
    const originalAccessKey = (config as any).S3_ACCESS_KEY;
    const originalSecretKey = (config as any).S3_SECRET_KEY;
    const originalPublicUrl = (config as any).S3_PUBLIC_URL;
    (config as any).STORAGE_DRIVER = 's3';
    (config as any).S3_ENDPOINT = 'https://s3.example.com';
    (config as any).S3_BUCKET = 'test-bucket';
    (config as any).S3_ACCESS_KEY = 'test-access-key';
    (config as any).S3_SECRET_KEY = 'test-secret-key';
    (config as any).S3_PUBLIC_URL = 'https://cdn.example.com';

    const driver = createStorageDriver();
    expect(driver).toBeInstanceOf(S3StorageDriver);

    (config as any).STORAGE_DRIVER = originalDriver;
    (config as any).S3_ENDPOINT = originalEndpoint;
    (config as any).S3_BUCKET = originalBucket;
    (config as any).S3_ACCESS_KEY = originalAccessKey;
    (config as any).S3_SECRET_KEY = originalSecretKey;
    (config as any).S3_PUBLIC_URL = originalPublicUrl;
  });
});
