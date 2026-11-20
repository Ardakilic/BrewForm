import { mkdir, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { config } from '../../config/index.ts';
import type { StorageDriver } from './types.ts';

/**
 * StorageDriver that writes files to UPLOAD_DIR on local disk and serves them
 * under `/uploads/`. `config.UPLOAD_DIR` is already absolute (resolved once in
 * `config/env.ts`), so the driver and the `/uploads/*` handler in `main.ts`
 * read and write the same directory. Filenames are validated against path
 * traversal before any filesystem access; deletes are best-effort (missing
 * files are ignored).
 */
export class LocalStorageDriver implements StorageDriver {
  /**
   * Write `data` to `<UPLOAD_DIR>/<filename>` (creating the directory if needed).
   *
   * @param data - File bytes.
   * @param filename - Relative filename inside UPLOAD_DIR.
   * @returns The root-relative public URL `/uploads/<filename>`.
   * @throws {Error} `Invalid filename` on an absolute or traversing filename.
   */
  async save(data: Uint8Array, filename: string): Promise<string> {
    const targetPath = this._resolvePath(filename);
    await mkdir(config.UPLOAD_DIR, { recursive: true });
    await writeFile(targetPath, data);
    return `/uploads/${filename}`;
  }

  /**
   * Delete `<UPLOAD_DIR>/<filename>`; a missing file is not an error.
   *
   * @param filename - Relative filename inside UPLOAD_DIR.
   * @throws {Error} `Invalid filename` on an absolute or traversing filename.
   */
  async delete(filename: string): Promise<void> {
    const targetPath = this._resolvePath(filename);
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
