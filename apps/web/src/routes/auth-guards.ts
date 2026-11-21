import { redirect } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { ApiError } from '../api/errors.ts';
import { loginPathFor } from '../utils/safe-next.ts';

const log = createLogger('auth-guards');

/** The part of the loader/action arguments the guards need: every loader and action gets `request`. */
type GuardedArgs = { request: Request };

/** The login redirect for the request's own path and search. */
function loginRedirect(request: Request): Response {
  const url = new URL(request.url);
  return redirect(loginPathFor(url.pathname, url.search));
}

/**
 * Wraps an auth-guarded loader or action: a final HTTP 401 from the API (after the client's
 * session refresh) becomes `redirect('/login?next=<encoded pathname+search>')`, so an expired
 * session lands on the login page instead of the error boundary. Every other error, including
 * thrown `Response`s (404s, redirects) and 403s, is rethrown unchanged.
 */
export function requireAuth<A extends GuardedArgs, R>(fn: (args: A) => Promise<R>) {
  return async (args: A): Promise<R> => {
    try {
      return await fn(args);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        log.debug({ status: 401 }, 'requireAuth redirecting to login');
        throw loginRedirect(args.request);
      }
      throw err;
    }
  };
}

/**
 * Wraps an admin loader or action: a final HTTP 401 redirects to `/login?next=…` (as
 * {@link requireAuth}) and an HTTP 403 (signed in but not an admin) redirects to `/`. Every
 * other error is rethrown unchanged.
 */
export function requireAdmin<A extends GuardedArgs, R>(fn: (args: A) => Promise<R>) {
  return async (args: A): Promise<R> => {
    try {
      return await fn(args);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        log.debug({ status: 401 }, 'requireAdmin redirecting to login');
        throw loginRedirect(args.request);
      }
      if (err instanceof ApiError && err.status === 403) {
        log.debug({ status: 403 }, 'requireAdmin redirecting home');
        throw redirect('/');
      }
      throw err;
    }
  };
}
