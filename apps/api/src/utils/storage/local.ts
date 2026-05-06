import { config } from '../../config/index.ts';
import type { StorageDriver } from './types.ts';
import * as path from 'jsr:@std/path';

export class LocalStorageDriver implements StorageDriver {
  async save(data: Uint8Array, filename: string): Promise<string> {
    const targetPath = this._resolvePath(filename);
    await Deno.mkdir(config.UPLOAD_DIR, { recursive: true });
    await Deno.writeFile(targetPath, data);
    return `/uploads/${filename}`;
  }

  async delete(filename: string): Promise<void> {
    const targetPath = this._resolvePath(filename);
    try {
      await Deno.remove(targetPath);
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
    if (!targetPath.startsWith(resolvedUploadDir + path.SEPARATOR)) {
      throw new Error('Invalid filename');
    }
    return targetPath;
  }
}
