import { beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { LocalStorageDriver } from './local.ts';

describe('LocalStorageDriver', () => {
  const testDir = '/tmp/brewform-storage-test';
  let driver: LocalStorageDriver;

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
    (config as any).UPLOAD_DIR = testDir;

    driver = new LocalStorageDriver();
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
    (config as any).STORAGE_DRIVER = 's3';

    const driver = createStorageDriver();
    expect(driver).toBeInstanceOf(S3StorageDriver);

    (config as any).STORAGE_DRIVER = originalDriver;
  });
});
