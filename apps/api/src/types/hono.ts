import type { CacheProvider } from '../utils/cache/index.ts';
import type { User } from '@brewform/shared/types';

/**
 * The user object stored in the Hono context.
 * Mirrors the shared User type with `preferences` made optional,
 * since not all middleware paths guarantee preferences are loaded.
 */
export type ContextUser = Omit<User, 'preferences'> & {
  preferences?: User['preferences'];
};

/** Context variables set by middleware (request ID, cache, auth) and read by route handlers. */
export type AppVariables = {
  requestId: string;
  cache: CacheProvider;
  userId: string | null;
  user: ContextUser | null;
};

/** Hono environment binding {@link AppVariables}; the generic passed to every `Hono<AppEnv>` router. */
export type AppEnv = {
  Variables: AppVariables;
};
