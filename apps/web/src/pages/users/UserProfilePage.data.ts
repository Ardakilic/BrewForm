import type {
  BrewLogListItemOutput,
  CollectionListItemOutput,
  FollowerListItemOutput,
  FollowingListItemOutput,
  PaginatedResponse,
  PublicUserOutput,
} from '@brewform/shared/schemas';
import type { LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { ApiError, isAbortError } from '../../api/errors.ts';
import {
  brewLogApi,
  collectionApi,
  followApi,
  type RequestOptions,
  userApi,
} from '../../api/index.ts';
import { withDataLog } from '../../routes/data-logging.ts';
import { readPage } from '../../utils/list-params.ts';

const log = createLogger('UserProfilePage');

/** Collections shown per page on the profile collections tab (`?collectionsPage=`). */
export const PROFILE_COLLECTIONS_PER_PAGE = 20;

/** A follower or following row on the profile's follow tabs. */
export type FollowRecord = FollowerListItemOutput | FollowingListItemOutput;

/** Loader data for the user profile page — public profile plus tab-specific follow/collection/brew data. */
export interface ProfileLoaderData {
  profile: PublicUserOutput;
  followData: FollowRecord[] | null;
  collectionsData: PaginatedResponse<CollectionListItemOutput> | null;
  brewsData: PaginatedResponse<BrewLogListItemOutput> | null;
}

/**
 * Fetches the public profile for `username`; an unknown username (API 404) throws a 404
 * `Response` so the not-found page renders. Other errors are rethrown.
 */
async function getProfileOrNotFound(
  username: string,
  opts: RequestOptions,
): Promise<PublicUserOutput> {
  try {
    return await userApi.getProfile(username, opts);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      throw new Response('Not Found', { status: 404 });
    }
    throw err;
  }
}

/**
 * Loads the VIEWER's own brew journal for `?brewsPage`, but only after establishing that the
 * viewer IS the profile being viewed. Ownership compares ids, not the URL username: profile
 * URLs resolve case-insensitively (`/u/arda` opens `Arda`). A URL-forced `?tab=brews` on
 * another user's profile (or while logged out) skips the request and returns `null`. Once
 * ownership is established, list errors propagate to the route error element instead of
 * rendering an empty journal.
 */
async function loadOwnBrews(
  profile: PublicUserOutput,
  searchParams: URLSearchParams,
  opts: RequestOptions,
): Promise<PaginatedResponse<BrewLogListItemOutput> | null> {
  const viewer = await userApi.me(opts).catch((err: unknown) => {
    if (isAbortError(err)) throw err;
    return null;
  });
  if (viewer?.id !== profile.id) return null;
  return brewLogApi.list({ page: readPage(searchParams, 'brewsPage') }, opts);
}

/**
 * `/u/:username` loader: the profile plus the data of the `?tab=` it opens on — the follower or
 * following list, the requested `?collectionsPage` of the user's collections, or (on the
 * viewer's own profile only, see {@link loadOwnBrews}) the brew journal for `?brewsPage`. Other
 * tabs leave those fields `null`. Every request carries `request.signal`.
 */
export async function loader({
  params,
  request,
}: Pick<LoaderFunctionArgs, 'params' | 'request'>): Promise<ProfileLoaderData> {
  const username = params.username;
  if (!username) throw new Response('Not Found', { status: 404 });
  const url = new URL(request.url);
  const tab = url.searchParams.get('tab') ?? 'recipes';
  const opts = { signal: request.signal };
  return await withDataLog(log, 'UserProfilePage loadProfile', { tab }, async () => {
    const profile = await getProfileOrNotFound(username, opts);
    let followData: FollowRecord[] | null = null;
    let collectionsData: PaginatedResponse<CollectionListItemOutput> | null = null;
    let brewsData: PaginatedResponse<BrewLogListItemOutput> | null = null;
    if (tab === 'followers') {
      followData = await followApi.followers(profile.id, opts);
    } else if (tab === 'following') {
      followData = await followApi.following(profile.id, opts);
    } else if (tab === 'collections') {
      collectionsData = await collectionApi.listByUser(
        profile.id,
        {
          page: String(readPage(url.searchParams, 'collectionsPage')),
          perPage: String(PROFILE_COLLECTIONS_PER_PAGE),
        },
        opts,
      );
    } else if (tab === 'brews') {
      brewsData = await loadOwnBrews(profile, url.searchParams, opts);
    }
    return { profile, followData, collectionsData, brewsData };
  });
}
