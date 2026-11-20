/**
 * Storage startup verification and the readiness storage probe.
 *
 * `verifyStorage` runs in `main.ts` before the server listens. For the local
 * driver it creates `UPLOAD_DIR`, proves the process can write to it by writing
 * and deleting a probe file (a real write catches wrong ownership, mode bits,
 * `:ro` mounts, SELinux labels and NFS root squashing alike), and in production
 * warns when the directory is not a mount point (files would be lost when the
 * container is recreated). A failure throws {@link StorageStartupError}, whose
 * message names the directory, the process UID/GID, the errno code and the
 * ownership fix; `main.ts` logs it once and exits with status 1.
 *
 * `checkStorageHealth` serves the `storage` key of `GET /ready`: `ok`,
 * `ephemeral` (writable but not a mounted volume), `degraded` (not writable)
 * or `s3`. Logs never contain S3 keys, file contents or environment values.
 */
import { constants as fsConstants } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Logger } from '@brewform/shared/logger';
import type { Env } from '../../config/index.ts';
import { createLogger } from '../logger/index.ts';

/** Module logger, used when no logger is injected. */
const moduleLog = createLogger('storage-startup');

/** The config keys the storage startup check reads. */
export type StorageStartupConfig = Pick<Env, 'STORAGE_DRIVER' | 'UPLOAD_DIR' | 'APP_ENV'> &
  Partial<Pick<Env, 'S3_BUCKET' | 'S3_ACCESS_KEY' | 'S3_SECRET_KEY'>>;

/** Injectable filesystem functions (defaults: `node:fs/promises`). */
export interface StorageFsDeps {
  mkdir: (dir: string, options: { recursive: true }) => Promise<unknown>;
  writeFile: (file: string, data: string) => Promise<void>;
  unlink: (file: string) => Promise<void>;
  stat: (target: string) => Promise<{ dev: number | bigint }>;
  access: (target: string, mode?: number) => Promise<void>;
}

/** The logger methods the storage startup check uses. */
export type StorageLogger = Pick<Logger, 'debug' | 'info' | 'warn'>;

/** Result of {@link verifyStorage}. */
export interface StorageStartupResult {
  storageDriver: 'local' | 's3';
  /** Absolute upload directory (local driver only). */
  uploadDir?: string;
  /** S3 bucket name (s3 driver only). */
  bucket?: string;
  /** `false` only for a production upload directory that is not a mount point. */
  mounted: boolean;
}

/** Storage state reported by `GET /ready` under the `storage` key. */
export type StorageHealth = 'ok' | 'ephemeral' | 'degraded' | 's3';

/** Default filesystem deps backed by `node:fs/promises`. */
const defaultFsDeps: StorageFsDeps = {
  mkdir: (dir, options) => fs.mkdir(dir, options),
  writeFile: (file, data) => fs.writeFile(file, data),
  unlink: (file) => fs.unlink(file),
  stat: (target) => fs.stat(target),
  access: (target, mode) => fs.access(target, mode),
};

/** Last `mounted` result recorded by {@link verifyStorage} (undefined until it runs). */
let lastMounted: boolean | undefined;

/**
 * Thrown by {@link verifyStorage} when the upload directory cannot be created or
 * written. The message carries the fix; no file contents or env values.
 */
export class StorageStartupError extends Error {
  /** The absolute upload directory that failed the check. */
  readonly uploadDir: string;
  /** The errno code of the failed operation (`EACCES`, `EROFS`, `ENOENT`, …). */
  readonly code: string;

  /**
   * @param uploadDir - The absolute upload directory.
   * @param code - The errno code of the failed filesystem call.
   * @param options - The original error as `cause`.
   */
  constructor(uploadDir: string, code: string, options?: { cause?: unknown }) {
    super(
      `Upload directory ${uploadDir} is not writable by uid ${processId('uid')} gid ${processId('gid')} (${code}). ` +
        'Give it to this user, for example: chown -R 1000:1000 <volume or host folder>. ' +
        'With compose.production.yml run: make prod-fix-uploads-owner',
      options,
    );
    this.name = 'StorageStartupError';
    this.uploadDir = uploadDir;
    this.code = code;
  }
}

/**
 * The process UID or GID, or `unknown` on platforms without them (Windows).
 *
 * @param kind - `uid` or `gid`.
 */
function processId(kind: 'uid' | 'gid'): string {
  const value = kind === 'uid' ? process.getuid?.() : process.getgid?.();
  return value === undefined ? 'unknown' : String(value);
}

/** The errno `code` of a filesystem error, or `UNKNOWN`. */
function errnoCode(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : 'UNKNOWN';
}

/**
 * Verify the configured storage before the server starts listening.
 *
 * - `s3`: logs `{ storageDriver: 's3', bucket }` at info and touches no files.
 * - `local`: creates `UPLOAD_DIR` (`recursive: true`), writes and deletes
 *   `<UPLOAD_DIR>/.brewform-write-test-<pid>`, logs
 *   `{ storageDriver: 'local', uploadDir }` at info and, in production only,
 *   warns once when `stat(UPLOAD_DIR).dev` equals `stat(parent).dev`.
 *
 * Records the `mounted` result for {@link checkStorageHealth}.
 *
 * @param config - The storage-related config keys.
 * @param fsDeps - Filesystem functions (injectable for tests).
 * @param log - Logger (defaults to the module logger).
 * @returns `{ storageDriver, uploadDir, mounted }` (or `{ storageDriver, bucket, mounted }` for s3).
 * @throws {StorageStartupError} When the directory cannot be created or written.
 */
export async function verifyStorage(
  config: StorageStartupConfig,
  fsDeps: StorageFsDeps = defaultFsDeps,
  log: StorageLogger = moduleLog,
): Promise<StorageStartupResult> {
  log.debug({ storageDriver: config.STORAGE_DRIVER }, 'verifyStorage started');

  if (config.STORAGE_DRIVER === 's3') {
    log.info({ storageDriver: 's3', bucket: config.S3_BUCKET }, 'Storage configured');
    lastMounted = true;
    log.debug({ storageDriver: 's3' }, 'verifyStorage completed');
    return { storageDriver: 's3', bucket: config.S3_BUCKET, mounted: true };
  }

  const uploadDir = config.UPLOAD_DIR;
  const probe = path.join(uploadDir, `.brewform-write-test-${process.pid}`);
  try {
    await fsDeps.mkdir(uploadDir, { recursive: true });
    await fsDeps.writeFile(probe, 'ok');
    await fsDeps.unlink(probe);
  } catch (err) {
    const code = errnoCode(err);
    log.debug({ storageDriver: 'local', uploadDir, code }, 'verifyStorage failed');
    throw new StorageStartupError(uploadDir, code, { cause: err });
  }

  let mounted = true;
  if (config.APP_ENV === 'production') {
    const [dirStat, parentStat] = await Promise.all([
      fsDeps.stat(uploadDir),
      fsDeps.stat(path.dirname(uploadDir)),
    ]);
    if (dirStat.dev === parentStat.dev) {
      mounted = false;
      log.warn(
        { uploadDir },
        'UPLOAD_DIR is not a mounted volume; uploaded files will be lost when the container is recreated',
      );
    }
  }

  lastMounted = mounted;
  log.info({ storageDriver: 'local', uploadDir }, 'Storage verified');
  log.debug({ storageDriver: 'local', uploadDir, mounted }, 'verifyStorage completed');
  return { storageDriver: 'local', uploadDir, mounted };
}

/**
 * Report the storage state for the readiness probe with a single
 * `access(UPLOAD_DIR, W_OK)` call (none for s3): `s3`, `degraded` when the
 * directory is not writable, `ephemeral` when {@link verifyStorage} found no
 * mounted volume, otherwise `ok`. Informational only; it never fails readiness.
 *
 * @param config - The storage-related config keys.
 * @param deps - The `access` function (injectable for tests).
 * @returns The storage state.
 */
export async function checkStorageHealth(
  config: StorageStartupConfig,
  deps: Pick<StorageFsDeps, 'access'> = defaultFsDeps,
): Promise<StorageHealth> {
  if (config.STORAGE_DRIVER === 's3') return 's3';
  try {
    await deps.access(config.UPLOAD_DIR, fsConstants.W_OK);
  } catch (err) {
    moduleLog.debug({ uploadDir: config.UPLOAD_DIR, code: errnoCode(err) }, 'storage degraded');
    return 'degraded';
  }
  return lastMounted === false ? 'ephemeral' : 'ok';
}

/** Forget the recorded `mounted` result (test isolation only). */
export function resetStorageStartupStateForTests(): void {
  lastMounted = undefined;
}
