import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { SEOHead } from '../../components/seo/SEOHead';
import { FollowButton } from '../../components/user/FollowButton';

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
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('recipes');

  const isSelf = user?.username === username;

  useEffect(() => {
    if (!username) return;
    setLoading(true);
    api.get<UserProfile>(`/users/${username}`).then((data) => {
      setProfile(data as UserProfile);
    }).catch(() => {
    }).finally(() => setLoading(false));
  }, [username]);

  if (loading) return <div className="mx-auto max-w-4xl px-6 py-12 text-center" style={{ color: 'var(--text-secondary)' }}>Loading...</div>;
  if (!profile) return <div className="mx-auto max-w-4xl px-6 py-12 text-center" style={{ color: 'var(--text-tertiary)' }}>User not found.</div>;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <SEOHead title={profile.displayName || profile.username} description={profile.bio || undefined} />

      <div className="card mb-6">
        <div className="flex items-start gap-4">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-2xl"
            style={{ backgroundColor: 'var(--bg-tertiary)' }}
          >
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="" className="w-16 h-16 rounded-full object-cover" />
            ) : (
              (profile.displayName || profile.username).charAt(0).toUpperCase()
            )}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {profile.displayName || profile.username}
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>@{profile.username}</p>
            {profile.bio && <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>{profile.bio}</p>}
            <div className="flex gap-4 mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <span><strong>{profile.recipeCount}</strong> recipes</span>
              <span><strong>{profile.followerCount}</strong> followers</span>
              <span><strong>{profile.followingCount}</strong> following</span>
            </div>
          </div>
          <div className="flex gap-2">
            {isSelf ? (
              <Link to="/settings" className="btn-secondary text-sm">Edit Profile</Link>
            ) : (
              <FollowButton userId={profile.id} initialFollowing={profile.isFollowing} />
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {(['recipes', 'badges', 'followers', 'following'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className="text-sm px-4 py-2 rounded"
            style={{
              backgroundColor: tab === t ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
              color: tab === t ? 'var(--bg-primary)' : 'var(--text-primary)',
            }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'recipes' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {profile.recipes.length === 0 ? (
            <p style={{ color: 'var(--text-tertiary)' }}>No recipes yet.</p>
          ) : (
            profile.recipes.map((r) => (
              <Link key={r.id} to={`/recipes/${r.slug}`} className="card hover:shadow-lg transition-shadow">
                <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{r.title}</h3>
                <div className="mt-1 flex gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  <span>❤️ {r.likeCount}</span>
                  <span>💬 {r.commentCount}</span>
                </div>
              </Link>
            ))
          )}
        </div>
      )}

      {tab === 'badges' && (
        <div className="flex flex-wrap gap-3">
          {profile.badges.length === 0 ? (
            <p style={{ color: 'var(--text-tertiary)' }}>No badges yet.</p>
          ) : (
            profile.badges.map((b) => (
              <div key={b.id} className="card text-center">
                <div className="text-2xl">{b.emoji}</div>
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{b.name}</div>
                <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{b.description}</div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'followers' && <FollowList userId={profile.id} type="followers" />}
      {tab === 'following' && <FollowList userId={profile.id} type="following" />}
    </div>
  );
}

function FollowList({ userId, type }: { userId: string; type: 'followers' | 'following' }) {
  const [users, setUsers] = useState<{ id: string; username: string; displayName: string | null }[]>([]);

  useEffect(() => {
    api.get<{ users: { id: string; username: string; displayName: string | null }[] }>(`/follow/${userId}/${type}`)
      .then((data) => {
        const d = data as Record<string, unknown>;
        setUsers((d.users as { id: string; username: string; displayName: string | null }[]) || []);
      })
      .catch(() => {});
  }, [userId, type]);

  return (
    <div className="flex flex-col gap-2">
      {users.length === 0 ? (
        <p style={{ color: 'var(--text-tertiary)' }}>No {type} yet.</p>
      ) : (
        users.map((u) => (
          <Link key={u.id} to={`/u/${u.username}`} className="card flex items-center gap-2 hover:shadow-lg transition-shadow">
            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{u.displayName || u.username}</span>
            <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>@{u.username}</span>
          </Link>
        ))
      )}
    </div>
  );
}