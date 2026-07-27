/** Storage backend abstraction: `save` persists bytes and returns a public URL, `delete` removes by filename. */
export interface StorageDriver {
  save(data: Uint8Array, filename: string): Promise<string>; // returns public URL
  delete(filename: string): Promise<void>;
}
