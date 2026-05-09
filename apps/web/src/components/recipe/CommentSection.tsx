import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client.ts';
import { useAuth } from '../../contexts/AuthContext.tsx';

interface Comment {
  id: string;
  content: string;
  authorId: string;
  // The API returns author as a nested object
  author?: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
  // Legacy flat fields (kept for compatibility)
  authorUsername?: string;
  authorAvatarUrl?: string | null;
  createdAt: string;
  isOp?: boolean;
  replies?: Comment[];
}

interface Props {
  recipeId: string;
  recipeAuthorId: string;
}

export function CommentSection({ recipeId, recipeAuthorId }: Props) {
  const { user, isAuthenticated } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    // The comment endpoint uses paginated() — the array is returned directly in data.data.
    api.get<Comment[]>(`/comments/recipe/${recipeId}?page=${page}`)
      .then((data: Comment[]) => {
        setComments(Array.isArray(data) ? data : []);
        setTotal(Array.isArray(data) ? data.length : 0);
      })
      .catch(() => {});
  }, [recipeId, page]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim() || loading) return;
    setLoading(true);
    try {
      const data = await api.post<Record<string, unknown>>(`/comments/recipe/${recipeId}`, {
        content: newComment.trim(),
      });
      // The API returns the raw comment row without the author join.
      // Inject the current user's info so the comment displays correctly immediately.
      const optimisticComment: Comment = {
        ...(data as unknown as Comment),
        author: user
          ? {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
          }
          : undefined,
        replies: [],
      };
      setComments((prev) => [optimisticComment, ...prev]);
      setTotal((t) => t + 1);
      setNewComment('');
    } catch {
    } finally {
      setLoading(false);
    }
  }

  function isAuthor(comment: Comment) {
    return comment.authorId === recipeAuthorId;
  }

  function getAuthorUsername(comment: Comment): string | null {
    return comment.author?.username || comment.authorUsername || null;
  }

  function getAuthorName(comment: Comment): string {
    return comment.author?.displayName || comment.author?.username ||
      comment.authorUsername || 'Unknown';
  }

  function AuthorLink({ comment, className }: { comment: Comment; className?: string }) {
    const username = getAuthorUsername(comment);
    const name = getAuthorName(comment);
    if (username) {
      return (
        <Link
          to={`/u/${username}`}
          className={className}
          style={{ color: 'var(--accent-primary)' }}
        >
          {name}
        </Link>
      );
    }
    return <span className={className} style={{ color: 'var(--text-primary)' }}>{name}</span>;
  }

  function renderComment(comment: Comment) {
    return (
      <div
        key={comment.id}
        className='rounded-lg p-4'
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
        }}
      >
        <div className='flex items-center gap-2 mb-2'>
          <AuthorLink comment={comment} className='font-medium text-sm' />
          {isAuthor(comment) && <span className='badge text-xs'>OP</span>}
          <span className='text-xs' style={{ color: 'var(--text-tertiary)' }}>
            {new Date(comment.createdAt).toLocaleDateString()}
          </span>
        </div>
        <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>{comment.content}</p>
        {/* Replies (OP-only) */}
        {Array.isArray(comment.replies) && comment.replies.length > 0 && (
          <div className='mt-3 ml-4 flex flex-col gap-2'>
            {comment.replies.map((reply) => (
              <div
                key={reply.id}
                className='rounded p-3'
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-primary)',
                }}
              >
                <div className='flex items-center gap-2 mb-1'>
                  <AuthorLink comment={reply} className='font-medium text-xs' />
                  <span className='badge text-xs'>OP</span>
                  <span className='text-xs' style={{ color: 'var(--text-tertiary)' }}>
                    {new Date(reply.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className='text-xs' style={{ color: 'var(--text-secondary)' }}>
                  {reply.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <h3 className='text-lg font-semibold mb-4' style={{ color: 'var(--text-primary)' }}>
        Comments ({total})
      </h3>

      {isAuthenticated && (
        <form onSubmit={handleSubmit} className='mb-6'>
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder='Write a comment...'
            className='input-field mb-2'
            rows={3}
          />
          <button type='submit' className='btn-primary' disabled={loading || !newComment.trim()}>
            {loading ? 'Posting...' : 'Post Comment'}
          </button>
        </form>
      )}

      <div className='flex flex-col gap-4'>
        {comments.map((comment) => renderComment(comment))}
      </div>

      {total > comments.length && (
        <div className='mt-4 text-center'>
          <button
            type='button'
            onClick={() => setPage((p) => p + 1)}
            className='btn-secondary'
          >
            Load More
          </button>
        </div>
      )}
    </div>
  );
}
