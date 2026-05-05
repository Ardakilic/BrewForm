import { config } from '../../config/index.ts';
import type { StorageDriver } from './types.ts';

export class LocalStorageDriver implements StorageDriver {
  async save(data: Uint8Array, filename: string): Promise<string> {
    const dir = config.UPLOAD_DIR;
    await Deno.mkdir(dir, { recursive: true });
    const path = `${dir}/${filename}`;
    await Deno.writeFile(path, data);
    return `/uploads/${filename}`;
  }

  async delete(filename: string): Promise<void> {
    try {
      await Deno.remove(`${config.UPLOAD_DIR}/${filename}`);
    } catch {
      // ignore
    }
  }
}
