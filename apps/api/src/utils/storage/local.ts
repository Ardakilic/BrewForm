import { mkdir, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { config } from '../../config/index.ts';
import type { StorageDriver } from './types.ts';

/**
 * StorageDriver that writes files to UPLOAD_DIR on local disk and serves them
 * under `/uploads/`. Filenames are validated against path traversal before
 * any filesystem access; deletes are best-effort (missing files are ignored).
 */
export class LocalStorageDriver implements StorageDriver {
  async save(data: Uint8Array, filename: string): Promise<string> {
    const targetPath = this._resolvePath(filename);
    await mkdir(config.UPLOAD_DIR, { recursive: true });
    await writeFile(targetPath, data);
    return `/uploads/${filename}`;
  }

  async delete(filename: string): Promise<void> {
    const targetPath = this._resolvePath(filename);
    try {
      await rm(targetPath, { force: true });
    } catch {
      // ignore
    }
  }

  private _resolvePath(filename: string): string {
    if (path.isAbsolute(filename) || filename.includes('..')) {
      throw new Error('Invalid filename');
    }
    const resolvedUploadDir = path.resolve(config.UPLOAD_DIR);
    const targetPath = path.resolve(path.join(resolvedUploadDir, filename));
    if (!targetPath.startsWith(resolvedUploadDir + path.sep)) {
      throw new Error('Invalid filename');
    }
    return targetPath;
  }
}
