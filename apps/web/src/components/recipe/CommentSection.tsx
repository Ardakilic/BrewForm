import { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

interface Comment {
  id: string;
  content: string;
  authorId: string;
  authorUsername: string;
  authorAvatarUrl: string | null;
  createdAt: string;
  isOp: boolean;
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
    api.get<{ comments: Comment[]; total: number }>(`/comments/recipe/${recipeId}?page=${page}`)
      .then((data) => {
        const d = data as Record<string, unknown>;
        setComments((d.comments as Comment[]) || []);
        setTotal((d.total as number) || 0);
      })
      .catch(() => {});
  }, [recipeId, page]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim() || loading) return;
    setLoading(true);
    try {
      const data = await api.post<Comment>(`/comments/recipe/${recipeId}`, { content: newComment.trim() });
      setComments((prev) => [data as Comment, ...prev]);
      setNewComment('');
    } catch {
    } finally {
      setLoading(false);
    }
  }

  function isAuthor(comment: Comment) {
    return comment.authorId === recipeAuthorId;
  }

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
        Comments ({total})
      </h3>

      {isAuthenticated && (
        <form onSubmit={handleSubmit} className="mb-6">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Write a comment..."
            className="input-field mb-2"
            rows={3}
          />
          <button type="submit" className="btn-primary" disabled={loading || !newComment.trim()}>
            {loading ? 'Posting...' : 'Post Comment'}
          </button>
        </form>
      )}

      <div className="flex flex-col gap-4">
        {comments.map((comment) => (
          <div
            key={comment.id}
            className="rounded-lg p-4"
            style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                {comment.authorUsername}
              </span>
              {isAuthor(comment) && (
                <span className="badge text-xs">OP</span>
              )}
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {new Date(comment.createdAt).toLocaleDateString()}
              </span>
            </div>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{comment.content}</p>
          </div>
        ))}
      </div>

      {total > comments.length && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            className="btn-secondary"
          >
            Load More
          </button>
        </div>
      )}
    </div>
  );
}