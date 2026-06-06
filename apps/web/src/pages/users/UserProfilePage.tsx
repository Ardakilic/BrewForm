import { useEffect } from 'react';
import { Link, useLoaderData, useNavigation, useParams, useSearchParams } from 'react-router';
import { api } from '../../api/client.ts';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { createLogger } from '@/utils/logger.ts';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { UserProfileSkeleton } from '../../components/ui/Skeleton.tsx';
import { FollowButton } from '../../components/user/FollowButton.tsx';

const log = createLogger('UserProfilePage');

interface UserProfile {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  followerCount: number;
  followingCount: number;
  recipeCount: number;
  isFollowing: boolean;
  badges: { id: string; name: string; emoji: string; description: string }[];
  recipes: {
    id: string;
    slug: string;
    title: string;
    likeCount: number;
    commentCount: number;
    currentVersion?: { brewMethod: string; drinkType: string };
    createdAt: string;
  }[];
}

type Tab = 'recipes' | 'badges' | 'followers' | 'following';

export interface ProfileLoaderData {
  profile: Record<string, unknown>;
  followData: Record<string, unknown> | null;
}

export const loader = async (
  { params, request }: { params: { username: string }; request: Request },
): Promise<ProfileLoaderData> => {
  const profile = await api.get<Record<string, unknown>>(`/users/${params.username}`);
  const tab = new URL(request.url).searchParams.get('tab') ?? 'recipes';
  let followData: Record<string, unknown> | null = null;
  if (tab === 'followers' || tab === 'following') {
    followData = await api.get<Record<string, unknown>>(
      `/follow/${(profile as Record<string, unknown>).id}/${tab}`,
    );
  }
  return { profile, followData };
};

type FollowRecord =
  | { id: string; follower: { id: string; username: string; displayName: string | null } }
  | { id: string; following: { id: string; username: string; displayName: string | null } };

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

export function UserProfilePage() {
  const { username } = useParams();
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigation = useNavigation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile, followData } = useLoaderData() as ProfileLoaderData;

  const typedProfile = profile as unknown as UserProfile;
  const tab = (searchParams.get('tab') ?? 'recipes') as Tab;
  const isSelf = user?.username === username;
  const loading = navigation.state === 'loading';

  useEffect(() => {
    log.debug({}, 'UserProfilePage mounted');
    return () => {
      log.debug({}, 'UserProfilePage unmounted');
    };
  }, []);

  if (loading && !profile) {
    return <UserProfileSkeleton />;
  }
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
  ];

  return (
    <div className='mx-auto max-w-4xl px-6 py-8'>
      <SEOHead
        title={typedProfile.displayName || typedProfile.username}
        description={typedProfile.bio || undefined}
      />

      <div className='card mb-6'>
        <div className='flex items-start gap-4'>
          <div
            className='w-16 h-16 rounded-full flex items-center justify-center text-2xl'
            style={{ backgroundColor: 'var(--bg-tertiary)' }}
          >
            {typedProfile.avatarUrl
              ? (
                <img
                  src={typedProfile.avatarUrl}
                  alt={t('a11y.userAvatar').replace(
                    '{name}',
                    typedProfile.displayName || typedProfile.username,
                  )}
                  className='w-16 h-16 rounded-full object-cover'
                  loading='lazy'
                  width={64}
                  height={64}
                />
              )
              : (
                (typedProfile.displayName || typedProfile.username).charAt(0).toUpperCase()
              )}
          </div>
          <div className='flex-1'>
            <h1 className='text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>
              {typedProfile.displayName || typedProfile.username}
            </h1>
            <p className='text-sm' style={{ color: 'var(--text-tertiary)' }}>
              @{typedProfile.username}
            </p>
            {typedProfile.bio && (
              <p className='mt-2 text-sm' style={{ color: 'var(--text-secondary)' }}>
                {typedProfile.bio}
              </p>
            )}
            <div className='flex gap-4 mt-2 text-sm' style={{ color: 'var(--text-secondary)' }}>
              <span>
                <strong>{typedProfile.recipeCount}</strong> {t('user.recipes').toLowerCase()}
              </span>
              <span>
                <strong>{typedProfile.followerCount}</strong> {t('user.followers').toLowerCase()}
              </span>
              <span>
                <strong>{typedProfile.followingCount}</strong> {t('user.following').toLowerCase()}
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
                  userId={typedProfile.id}
                  initialFollowing={typedProfile.isFollowing}
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
          {typedProfile.recipes.length === 0
            ? <p style={{ color: 'var(--text-tertiary)' }}>{t('user.noRecipes')}</p>
            : (
              typedProfile.recipes.map((r) => (
                <Link
                  key={r.id}
                  to={`/recipes/${r.slug}`}
                  className='card hover:shadow-lg transition-shadow'
                >
                  <h3 className='font-semibold' style={{ color: 'var(--text-primary)' }}>
                    {r.title}
                  </h3>
                  <div
                    className='mt-1 flex gap-2 text-xs'
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    <span>❤️ {r.likeCount}</span>
                    <span>💬 {r.commentCount}</span>
                  </div>
                </Link>
              ))
            )}
        </div>
      )}

      {tab === 'badges' && (
        <div className='flex flex-wrap gap-3'>
          {typedProfile.badges.length === 0
            ? <p style={{ color: 'var(--text-tertiary)' }}>{t('user.noBadges')}</p>
            : (
              typedProfile.badges.map((b) => (
                <div key={b.id} className='card text-center'>
                  <div className='text-2xl'>{b.emoji}</div>
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
          data={(Array.isArray(followData) ? followData : []) as FollowRecord[]}
          emptyMsg={t('user.noFollowers')}
        />
      )}
      {tab === 'following' && (
        <FollowList
          data={(Array.isArray(followData) ? followData : []) as FollowRecord[]}
          emptyMsg={t('user.noFollowing')}
        />
      )}
    </div>
  );
}
