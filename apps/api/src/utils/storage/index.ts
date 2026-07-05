import { config } from '../../config/index.ts';
import { LocalStorageDriver } from './local.ts';
import { S3StorageDriver } from './s3.ts';
import type { StorageDriver } from './types.ts';

/**
 * Construct the storage driver selected by config.STORAGE_DRIVER
 * ('s3' or 'local'; anything else falls back to local disk).
 */
export function createStorageDriver(): StorageDriver {
  switch (config.STORAGE_DRIVER) {
    case 's3':
      return new S3StorageDriver();
    case 'local':
    default:
      return new LocalStorageDriver();
  }
}

export type { StorageDriver };
