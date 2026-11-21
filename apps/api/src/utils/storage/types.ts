/**
 * Storage backend abstraction.
 *
 * Keys are server-generated (`utils/upload/index.ts`) and every driver checks
 * them with `assertSafeStorageKey` (`./key.ts`) before any I/O.
 */
export interface StorageDriver {
  /**
   * Persist `data` under `key` and return its public URL or path.
   *
   * @param data - The object bytes.
   * @param key - A flat, server-generated object key.
   * @param options - `contentType` is supplied by the caller (the server-detected
   *   MIME type); drivers never infer it from the key or from client input.
   */
  save(data: Uint8Array, key: string, options: { contentType: string }): Promise<string>;
  /** Remove the object stored under `key`. */
  delete(key: string): Promise<void>;
}
