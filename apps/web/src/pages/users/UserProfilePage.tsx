import { useEffect } from 'react';
import { Link, useLoaderData, useParams, useSearchParams } from 'react-router';
import { brewLogApi, collectionApi, followApi, userApi } from '../../api/index.ts';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import type {
  BrewLogListItemOutput,
  CollectionListItemOutput,
  FollowerListItemOutput,
  FollowingListItemOutput,
  PaginatedResponse,
  PublicUserOutput,
} from '@brewform/shared/schemas';
import { createLogger } from '../../utils/logger.ts';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { FollowButton } from '../../components/user/FollowButton.tsx';
import { RecipeCard } from '../../components/recipe-list/RecipeCard.tsx';
import { CollectionCard } from '../../components/collections/CollectionCard.tsx';
import { BrewLogCard } from '../../components/brew-log/BrewLogCard.tsx';

const log = createLogger('UserProfilePage');

type Tab = 'recipes' | 'badges' | 'followers' | 'following' | 'collections' | 'brews';

type FollowRecord = FollowerListItemOutput | FollowingListItemOutput;

/** Loader data for the user profile page — public profile plus tab-specific follow/collection/brew data. */
export interface ProfileLoaderData {
  profile: PublicUserOutput;
  followData: FollowRecord[] | null;
  collectionsData: PaginatedResponse<CollectionListItemOutput> | null;
  brewsData: PaginatedResponse<BrewLogListItemOutput> | null;
}

/**
 * Fetches the profile for `:username`, plus the follower/following list
 * when `?tab=` selects one; returns `{ profile, followData }` with
 * `followData` null on other tabs. The `brews` tab fetches the VIEWER's own
 * brew journal (the tab is only rendered on the viewer's own profile); the
 * auth-required fetch is swallowed to null so a URL-forced `?tab=brews` on
 * another profile never breaks the page.
 */
export const loader = async (
  { params, request }: { params: Record<string, string | undefined>; request: Request },
): Promise<ProfileLoaderData> => {
  const username = params.username;
  if (!username) throw new Response('Not Found', { status: 404 });
  const profile = await userApi.getProfile(username);
  const tab = new URL(request.url).searchParams.get('tab') ?? 'recipes';
  let followData: FollowRecord[] | null = null;
  let collectionsData: PaginatedResponse<CollectionListItemOutput> | null = null;
  let brewsData: PaginatedResponse<BrewLogListItemOutput> | null = null;
  if (tab === 'followers') {
    followData = await followApi.followers(profile.id);
  } else if (tab === 'following') {
    followData = await followApi.following(profile.id);
  } else if (tab === 'collections') {
    collectionsData = await collectionApi.listByUser(profile.id);
  } else if (tab === 'brews') {
    brewsData = await brewLogApi.list().catch(() => null);
  }
  return { profile, followData, collectionsData, brewsData };
};

function FollowList(
  { data, emptyMsg }: { data: FollowRecord[]; emptyMsg: string },
) {
  return (
    <div className='flex flex-col gap-2'>
      {data.length === 0 ? <p style={{ color: 'var(--text-tertiary)' }}>{emptyMsg}</p> : (
        data.map((u) => {
          const person = 'follower' in u ? u.follower : u.following;
          return (
            <Link
              key={u.id}
              to={`/u/${person.username}`}
              className='card flex items-center gap-2 hover:shadow-lg transition-shadow'
            >
              <span className='font-medium' style={{ color: 'var(--text-primary)' }}>
                {person.displayName || person.username}
              </span>
              <span className='text-sm' style={{ color: 'var(--text-tertiary)' }}>
                @{person.username}
              </span>
            </Link>
          );
        })
      )}
    </div>
  );
}

/**
 * Public profile page with recipes/badges/followers/following tabs
 * (driven by `?tab=`), follow button for other users, and profile
 * header from loader data.
 */
export function UserProfilePage() {
  const { username } = useParams();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile, followData, collectionsData, brewsData } = useLoaderData() as ProfileLoaderData;

  const isSelf = user?.username === username;
  const ALLOWED_TABS: readonly Tab[] = [
    'recipes',
    'badges',
    'followers',
    'following',
    'collections',
  ];
  // The brew journal is private — its tab is only valid on the viewer's own profile.
  const validTabs: readonly Tab[] = isSelf ? [...ALLOWED_TABS, 'brews'] : ALLOWED_TABS;
  const rawTab = searchParams.get('tab') ?? 'recipes';
  const tab: Tab = (validTabs as readonly string[]).includes(rawTab) ? (rawTab as Tab) : 'recipes';

  useEffect(() => {
    log.debug({}, 'UserProfilePage mounted');
    return () => {
      log.debug({}, 'UserProfilePage unmounted');
    };
  }, []);

  if (!profile) {
    return (
      <div
        className='mx-auto max-w-4xl px-6 py-12 text-center'
        style={{ color: 'var(--text-tertiary)' }}
      >
        {t('user.notFound')}
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'recipes', label: t('user.recipes') },
    { key: 'badges', label: t('user.badges') },
    { key: 'followers', label: t('user.followers') },
    { key: 'following', label: t('user.following') },
    { key: 'collections', label: t('user.collections') },
    ...(isSelf ? [{ key: 'brews' as Tab, label: t('brewLog.tab') }] : []),
  ];

  return (
    <div className='mx-auto max-w-4xl px-6 py-8'>
      <SEOHead
        title={profile.displayName || profile.username}
        description={profile.bio || undefined}
      />

      <div className='card mb-6'>
        <div className='flex items-start gap-4'>
          <div
            className='w-16 h-16 rounded-full flex items-center justify-center text-2xl'
            style={{ backgroundColor: 'var(--bg-tertiary)' }}
          >
            {profile.avatarUrl
              ? (
                <img
                  src={profile.avatarUrl}
                  alt={t('a11y.userAvatar').replace(
                    '{name}',
                    profile.displayName || profile.username,
                  )}
                  className='w-16 h-16 rounded-full object-cover'
                  loading='lazy'
                  width={64}
                  height={64}
                />
              )
              : (
                (profile.displayName || profile.username).charAt(0).toUpperCase()
              )}
          </div>
          <div className='flex-1'>
            <h1 className='text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>
              {profile.displayName || profile.username}
            </h1>
            <p className='text-sm' style={{ color: 'var(--text-tertiary)' }}>
              @{profile.username}
            </p>
            {profile.bio && (
              <p className='mt-2 text-sm' style={{ color: 'var(--text-secondary)' }}>
                {profile.bio}
              </p>
            )}
            <div className='flex gap-4 mt-2 text-sm' style={{ color: 'var(--text-secondary)' }}>
              <span>
                <strong>{profile.recipeCount}</strong> {t('user.recipes').toLowerCase()}
              </span>
              <span>
                <strong>{profile.followerCount}</strong> {t('user.followers').toLowerCase()}
              </span>
              <span>
                <strong>{profile.followingCount}</strong> {t('user.following').toLowerCase()}
              </span>
            </div>
          </div>
          <div className='flex gap-2'>
            {isSelf
              ? (
                <Link to='/settings' className='btn-secondary text-sm'>
                  {t('user.editProfile')}
                </Link>
              )
              : user && (
                <FollowButton
                  userId={profile.id}
                  initialFollowing={profile.isFollowing}
                />
              )}
          </div>
        </div>
      </div>

      <div className='flex gap-2 mb-6'>
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            type='button'
            onClick={() => setSearchParams({ tab: key })}
            className='text-sm px-4 py-2 rounded'
            style={{
              backgroundColor: tab === key ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
              color: tab === key ? 'var(--bg-primary)' : 'var(--text-primary)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'recipes' && (
        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
          {profile.recipes.length === 0
            ? <p style={{ color: 'var(--text-tertiary)' }}>{t('user.noRecipes')}</p>
            : profile.recipes.map((r) => <RecipeCard key={r.id} recipe={r} hideAuthor />)}
        </div>
      )}

      {tab === 'collections' && (
        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
          {!collectionsData || collectionsData.data.length === 0
            ? <p style={{ color: 'var(--text-tertiary)' }}>{t('user.noCollections')}</p>
            : collectionsData.data.map((c) => <CollectionCard key={c.id} collection={c} />)}
        </div>
      )}

      {tab === 'brews' && isSelf && (
        <div className='flex flex-col gap-3'>
          {!brewsData || brewsData.data.length === 0
            ? <p style={{ color: 'var(--text-tertiary)' }}>{t('brewLog.list.empty')}</p>
            : brewsData.data.map((entry) => <BrewLogCard key={entry.id} log={entry} />)}
        </div>
      )}

      {tab === 'badges' && (
        <div className='flex flex-wrap gap-3'>
          {profile.badges.length === 0
            ? <p style={{ color: 'var(--text-tertiary)' }}>{t('user.noBadges')}</p>
            : (
              profile.badges.map((b) => (
                <div key={b.id} className='card text-center'>
                  <div className='text-2xl'>{b.icon}</div>
                  <div className='text-sm font-medium' style={{ color: 'var(--text-primary)' }}>
                    {b.name}
                  </div>
                  <div className='text-xs' style={{ color: 'var(--text-tertiary)' }}>
                    {b.description}
                  </div>
                </div>
              ))
            )}
        </div>
      )}

      {tab === 'followers' && (
        <FollowList
          data={Array.isArray(followData) ? followData : []}
          emptyMsg={t('user.noFollowers')}
        />
      )}
      {tab === 'following' && (
        <FollowList
          data={Array.isArray(followData) ? followData : []}
          emptyMsg={t('user.noFollowing')}
        />
      )}
    </div>
  );
}
