import type { CacheProvider } from '../utils/cache/index.ts';

export type AppVariables = {
  requestId: string;
  cache: CacheProvider;
  userId: string | null;
  user: unknown | null;
};

export type AppEnv = {
  Variables: AppVariables;
};