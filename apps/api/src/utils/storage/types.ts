export interface StorageDriver {
  save(data: Uint8Array, filename: string): Promise<string>; // returns public URL
  delete(filename: string): Promise<void>;
}
