import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../../api/client.ts';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { UserProfileSkeleton } from '../../components/ui/Skeleton.tsx';
import { FollowButton } from '../../components/user/FollowButton.tsx';

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

export function UserProfilePage() {
  const { username } = useParams();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('recipes');

  const isSelf = user?.username === username;

  useEffect(() => {
    if (!username) return;
    setLoading(true);
    api.get<Record<string, unknown>>(`/users/${username}`).then((data: Record<string, unknown>) => {
      setProfile({
        ...(data as unknown as UserProfile),
        recipes: Array.isArray(data.recipes) ? (data.recipes as UserProfile['recipes']) : [],
        badges: Array.isArray(data.badges) ? (data.badges as UserProfile['badges']) : [],
        isFollowing: Boolean(data.isFollowing),
      });
    }).catch(() => {
    }).finally(() => setLoading(false));
  }, [username]);

  if (loading) {
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
            <p className='text-sm' style={{ color: 'var(--text-tertiary)' }}>@{profile.username}</p>
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
              : user && <FollowButton userId={profile.id} initialFollowing={profile.isFollowing} />}
          </div>
        </div>
      </div>

      <div className='flex gap-2 mb-6'>
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            type='button'
            onClick={() => setTab(key)}
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
            : (
              profile.recipes.map((r) => (
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
          {profile.badges.length === 0
            ? <p style={{ color: 'var(--text-tertiary)' }}>{t('user.noBadges')}</p>
            : (
              profile.badges.map((b) => (
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
        <FollowList userId={profile.id} type='followers' emptyMsg={t('user.noFollowers')} />
      )}
      {tab === 'following' && (
        <FollowList userId={profile.id} type='following' emptyMsg={t('user.noFollowing')} />
      )}
    </div>
  );
}

type FollowRecord =
  | { id: string; follower: { id: string; username: string; displayName: string | null } }
  | { id: string; following: { id: string; username: string; displayName: string | null } };

function FollowList(
  { userId, type, emptyMsg }: { userId: string; type: 'followers' | 'following'; emptyMsg: string },
) {
  const [users, setUsers] = useState<FollowRecord[]>([]);

  useEffect(() => {
    api.get<FollowRecord[]>(`/follow/${userId}/${type}`)
      .then((data: FollowRecord[]) => {
        setUsers(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
  }, [userId, type]);

  return (
    <div className='flex flex-col gap-2'>
      {users.length === 0 ? <p style={{ color: 'var(--text-tertiary)' }}>{emptyMsg}</p> : (
        users.map((u) => {
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
