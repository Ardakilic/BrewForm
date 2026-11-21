import { mkdir, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { config } from '../../config/index.ts';
import { assertSafeStorageKey } from './key.ts';
import type { StorageDriver } from './types.ts';

/**
 * StorageDriver that writes files to UPLOAD_DIR on local disk; they are served
 * under `/uploads/` by `serveLocalUpload` (`./serve.ts`, mounted in `main.ts`).
 * `config.UPLOAD_DIR` is already absolute (resolved once in `config/env.ts`), so
 * the driver and that handler read and write the same directory. Keys are checked with
 * `assertSafeStorageKey` and resolved against path traversal before any
 * filesystem access; files are created exclusively (never replaced); deletes
 * are best-effort (missing files are ignored).
 */
export class LocalStorageDriver implements StorageDriver {
  /**
   * Write `data` to `<UPLOAD_DIR>/<key>` (creating the directory if needed).
   * The write uses the exclusive-create flag `wx`, so an existing file is
   * never replaced.
   *
   * @param data - File bytes.
   * @param key - A flat, server-generated key inside UPLOAD_DIR.
   * @param _options - The content type; `serveLocalUpload` derives it from
   *   the server-generated extension, so the local driver does not store it.
   * @returns The root-relative public URL `/uploads/<key>`.
   * @throws {Error} `Invalid storage key` / `Invalid filename` on an unsafe key,
   *   or `EEXIST` when a file with that key already exists.
   */
  async save(data: Uint8Array, key: string, _options: { contentType: string }): Promise<string> {
    assertSafeStorageKey(key);
    const targetPath = this._resolvePath(key);
    await mkdir(config.UPLOAD_DIR, { recursive: true });
    await writeFile(targetPath, data, { flag: 'wx' });
    return `/uploads/${key}`;
  }

  /**
   * Delete `<UPLOAD_DIR>/<key>`; a missing file is not an error.
   *
   * @param key - A flat, server-generated key inside UPLOAD_DIR.
   * @throws {Error} `Invalid storage key` / `Invalid filename` on an unsafe key.
   */
  async delete(key: string): Promise<void> {
    assertSafeStorageKey(key);
    const targetPath = this._resolvePath(key);
    try {
      await rm(targetPath, { force: true });
    } catch {
      // ignore
    }
  }

  /**
   * Resolve `filename` inside the (absolute) upload directory, rejecting
   * absolute paths, `..` segments and anything that escapes the directory.
   *
   * @param filename - Relative filename inside UPLOAD_DIR.
   * @returns The absolute target path.
   * @throws {Error} `Invalid filename` when the filename is unsafe.
   */
  private _resolvePath(filename: string): string {
    if (path.isAbsolute(filename) || filename.includes('..')) {
      throw new Error('Invalid filename');
    }
    const uploadDir = config.UPLOAD_DIR;
    const targetPath = path.resolve(uploadDir, filename);
    if (!targetPath.startsWith(uploadDir + path.sep)) {
      throw new Error('Invalid filename');
    }
    return targetPath;
  }
}
