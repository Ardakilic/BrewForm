import '../../test-setup.ts';
import { constants as fsConstants } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkStorageHealth,
  resetStorageStartupStateForTests,
  type StorageFsDeps,
  type StorageLogger,
  type StorageStartupConfig,
  StorageStartupError,
  verifyStorage,
} from './startup.ts';

/**
 * Unit tests for the storage startup check (`verifyStorage`) and the readiness
 * probe helper (`checkStorageHealth`). Every filesystem call is injected, so
 * the tests cover missing directories, unwritable and read-only mounts, the
 * production mount-point warning and the S3 path without touching the disk.
 */

const UPLOAD_DIR = '/app/uploads';
const PROBE = `${UPLOAD_DIR}/.brewform-write-test-${process.pid}`;

/** A Node-style filesystem error with an errno `code`. */
function fsError(code: string) {
  return Object.assign(new Error(`${code}: operation failed`), { code });
}

/** Injectable fs deps that succeed by default; `devs` maps a path to its `stat().dev`. */
function makeDeps(devs: Record<string, number> = { [UPLOAD_DIR]: 2, '/app': 1 }) {
  return {
    mkdir: vi.fn<StorageFsDeps['mkdir']>(async () => undefined),
    writeFile: vi.fn<StorageFsDeps['writeFile']>(async () => undefined),
    unlink: vi.fn<StorageFsDeps['unlink']>(async () => undefined),
    stat: vi.fn<StorageFsDeps['stat']>(async (p: string) => ({ dev: devs[p] ?? 99 })),
    access: vi.fn<StorageFsDeps['access']>(async () => undefined),
  };
}

/** A logger whose methods are spies. */
function makeLog() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

/** Local-storage config with overrides. */
function localConfig(overrides: Partial<StorageStartupConfig> = {}): StorageStartupConfig {
  return { STORAGE_DRIVER: 'local', UPLOAD_DIR, APP_ENV: 'development', ...overrides };
}

const S3_CONFIG: StorageStartupConfig = {
  STORAGE_DRIVER: 's3',
  UPLOAD_DIR,
  APP_ENV: 'production',
  S3_BUCKET: 'brewform-photos',
  S3_ACCESS_KEY: 'AKIA-super-secret-access',
  S3_SECRET_KEY: 'super-secret-key-value',
};

afterEach(() => {
  resetStorageStartupStateForTests();
});

describe('verifyStorage — local driver', () => {
  it('should create the upload directory recursively', async () => {
    const deps = makeDeps();
    await verifyStorage(localConfig(), deps, makeLog() as unknown as StorageLogger);
    expect(deps.mkdir).toHaveBeenCalledWith(UPLOAD_DIR, { recursive: true });
  });

  it('should write and then unlink the probe file', async () => {
    const deps = makeDeps();
    await verifyStorage(localConfig(), deps, makeLog() as unknown as StorageLogger);
    expect(deps.writeFile).toHaveBeenCalledWith(PROBE, expect.any(String));
    expect(deps.unlink).toHaveBeenCalledWith(PROBE);
    expect(deps.writeFile.mock.invocationCallOrder[0]).toBeLessThan(
      deps.unlink.mock.invocationCallOrder[0],
    );
  });

  it('should log the driver and directory at info and return a mounted result', async () => {
    const log = makeLog();
    const result = await verifyStorage(localConfig(), makeDeps(), log as unknown as StorageLogger);
    expect(log.info).toHaveBeenCalledWith(
      { storageDriver: 'local', uploadDir: UPLOAD_DIR },
      expect.any(String),
    );
    expect(result).toEqual({ storageDriver: 'local', uploadDir: UPLOAD_DIR, mounted: true });
  });

  for (const code of ['EACCES', 'EROFS']) {
    it(`should throw StorageStartupError when the probe write fails with ${code}`, async () => {
      const deps = makeDeps();
      deps.writeFile.mockRejectedValueOnce(fsError(code));
      const error = await verifyStorage(
        localConfig(),
        deps,
        makeLog() as unknown as StorageLogger,
      ).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(StorageStartupError);
      const message = (error as Error).message;
      expect(message).toContain(`Upload directory ${UPLOAD_DIR}`);
      expect(message).toMatch(/uid \d+ gid \d+/);
      expect(message).toContain(code);
      expect(message).toContain('chown -R 1000:1000');
      expect(message).toContain('make prod-fix-uploads-owner');
      expect((error as StorageStartupError).code).toBe(code);
      expect((error as StorageStartupError).uploadDir).toBe(UPLOAD_DIR);
    });
  }

  it('should throw StorageStartupError when the directory cannot be created', async () => {
    const deps = makeDeps();
    deps.mkdir.mockRejectedValueOnce(fsError('EACCES'));
    await expect(
      verifyStorage(localConfig(), deps, makeLog() as unknown as StorageLogger),
    ).rejects.toBeInstanceOf(StorageStartupError);
    expect(deps.writeFile).not.toHaveBeenCalled();
  });

  it('should warn once and report mounted: false for a production directory on its parent device', async () => {
    const log = makeLog();
    const deps = makeDeps({ [UPLOAD_DIR]: 7, '/app': 7 });
    const result = await verifyStorage(
      localConfig({ APP_ENV: 'production' }),
      deps,
      log as unknown as StorageLogger,
    );
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith({ uploadDir: UPLOAD_DIR }, expect.any(String));
    expect(result.mounted).toBe(false);
    expect(deps.stat).toHaveBeenCalledWith(UPLOAD_DIR);
    expect(deps.stat).toHaveBeenCalledWith('/app');
  });

  it('should not warn for a production directory on its own device', async () => {
    const log = makeLog();
    const result = await verifyStorage(
      localConfig({ APP_ENV: 'production' }),
      makeDeps({ [UPLOAD_DIR]: 2, '/app': 1 }),
      log as unknown as StorageLogger,
    );
    expect(log.warn).not.toHaveBeenCalled();
    expect(result.mounted).toBe(true);
  });

  it('should never warn outside production, even on the parent device', async () => {
    for (const env of ['development', 'test'] as const) {
      const log = makeLog();
      const result = await verifyStorage(
        localConfig({ APP_ENV: env }),
        makeDeps({ [UPLOAD_DIR]: 7, '/app': 7 }),
        log as unknown as StorageLogger,
      );
      expect(log.warn).not.toHaveBeenCalled();
      expect(result.mounted).toBe(true);
    }
  });
});

describe('verifyStorage — s3 driver', () => {
  it('should log the bucket, skip every fs call and never log keys', async () => {
    const log = makeLog();
    const deps = makeDeps();
    const result = await verifyStorage(S3_CONFIG, deps, log as unknown as StorageLogger);
    expect(log.info).toHaveBeenCalledWith(
      { storageDriver: 's3', bucket: 'brewform-photos' },
      expect.any(String),
    );
    for (const fn of Object.values(deps)) expect(fn).not.toHaveBeenCalled();
    const logged = JSON.stringify(Object.values(log).flatMap((fn) => fn.mock.calls));
    expect(logged).not.toContain('AKIA-super-secret-access');
    expect(logged).not.toContain('super-secret-key-value');
    expect(result.storageDriver).toBe('s3');
  });
});

describe('checkStorageHealth', () => {
  it('should return ok when the directory is writable after a mounted result', async () => {
    await verifyStorage(localConfig(), makeDeps(), makeLog() as unknown as StorageLogger);
    const access = vi.fn(async () => undefined);
    await expect(checkStorageHealth(localConfig(), { access })).resolves.toBe('ok');
    expect(access).toHaveBeenCalledTimes(1);
    expect(access).toHaveBeenCalledWith(UPLOAD_DIR, fsConstants.W_OK);
  });

  it('should return ephemeral after a mounted: false result', async () => {
    const config = localConfig({ APP_ENV: 'production' });
    await verifyStorage(
      config,
      makeDeps({ [UPLOAD_DIR]: 7, '/app': 7 }),
      makeLog() as unknown as StorageLogger,
    );
    await expect(
      checkStorageHealth(config, { access: vi.fn(async () => undefined) }),
    ).resolves.toBe('ephemeral');
  });

  it('should return degraded when the access check rejects', async () => {
    await verifyStorage(localConfig(), makeDeps(), makeLog() as unknown as StorageLogger);
    const access = vi.fn(() => Promise.reject(fsError('EACCES')));
    await expect(checkStorageHealth(localConfig(), { access })).resolves.toBe('degraded');
  });

  it('should return s3 without calling access', async () => {
    const access = vi.fn(async () => undefined);
    await expect(checkStorageHealth(S3_CONFIG, { access })).resolves.toBe('s3');
    expect(access).not.toHaveBeenCalled();
  });
});
