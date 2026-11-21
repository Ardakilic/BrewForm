import type { LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { isAbortError } from '../api/errors.ts';
import { authApi } from '../api/index.ts';

const log = createLogger('rootLoader');

/** The route id of the app-shell root route (`/`), for `useRouteLoaderData(ROOT_ROUTE_ID)`. */
export const ROOT_ROUTE_ID = 'root';

/** Data the root route loads once for the whole app shell. */
export interface RootLoaderData {
  /** Whether self-registration is open (hides the sign-up links and form when false). */
  registrationEnabled: boolean;
}

/**
 * Root (`/`) loader: reads the server-side registration flag once for the app shell (the
 * navbar and the register page read it with `useRouteLoaderData('root')`). A failed status
 * check is logged and falls back to `registrationEnabled: true`, so a flaky endpoint never
 * blocks the app; an aborted request is rethrown.
 */
export async function rootLoader({ request }: LoaderFunctionArgs): Promise<RootLoaderData> {
  log.debug({}, 'rootLoader registrationStatus started');
  try {
    const { enabled } = await authApi.registrationStatus({ signal: request.signal });
    log.debug({ enabled }, 'rootLoader registrationStatus completed');
    return { registrationEnabled: enabled !== false };
  } catch (err) {
    if (isAbortError(err)) throw err;
    log.error({ err }, 'rootLoader registrationStatus failed');
    return { registrationEnabled: true };
  }
}

/** The root loader never revalidates: the registration flag is read once per page load. */
export function shouldRevalidateRoot(): boolean {
  return false;
}
