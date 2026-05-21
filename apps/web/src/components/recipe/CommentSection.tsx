import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client.ts';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';

interface Comment {
  id: string;
  content: string;
  authorId: string;
  author?: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
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

// ---------------------------------------------------------------------------
// Inline markdown renderer -- bold, italic, underline only. No HTML injection.
// Supports: **bold**, *italic*, __underline__, _italic_
// ---------------------------------------------------------------------------
function renderInlineMarkdown(text: string): React.ReactNode[] {
  // Pattern matches **bold**, __underline__, *italic*, _italic_ in that priority order.
  const pattern =
    /(\*\*(.+?)\*\*|__(.+?)__|(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)|(?<!_)_(?!_)(.+?)(?<!_)_(?!_))/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    // Push plain text before this match
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const full = match[0];
    if (full.startsWith('**')) {
      nodes.push(<strong key={match.index}>{match[2]}</strong>);
    } else if (full.startsWith('__')) {
      nodes.push(<u key={match.index}>{match[3]}</u>);
    } else {
      // *italic* or _italic_
      const inner = match[4] ?? match[5];
      nodes.push(<em key={match.index}>{inner}</em>);
    }

    lastIndex = match.index + full.length;
  }

  // Remaining plain text
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}

// ---------------------------------------------------------------------------
// CommentSection
// ---------------------------------------------------------------------------
export function CommentSection({ recipeId, recipeAuthorId }: Props) {
  const { user, isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  // replyingToId = the TOP-LEVEL comment id the form is attached to
  // replyMention = the @username pre-filled when replying to a reply
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [replyLoading, setReplyLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // A user can reply if they are: the recipe owner, an admin, OR the author of the top-level comment
  function canReplyToComment(topLevelComment: Comment): boolean {
    if (!isAuthenticated || user == null) return false;
    if (user.id === recipeAuthorId) return true;
    if (user.isAdmin === true) return true;
    if (user.id === topLevelComment.authorId) return true;
    return false;
  }

  useEffect(() => {
    api.get<Comment[]>(`/comments/recipe/${recipeId}?page=${page}`)
      .then((data: Comment[]) => {
        setComments(Array.isArray(data) ? data : []);
        setTotal(Array.isArray(data) ? data.length : 0);
      })
      .catch(() => {});
  }, [recipeId, page]);

  function openReplyForm(topLevelCommentId: string, mentionUsername?: string) {
    setReplyingToId(topLevelCommentId);
    setReplyContent(mentionUsername ? `@${mentionUsername} ` : '');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim() || loading) return;
    setLoading(true);
    setStatusMessage('');
    try {
      const data = await api.post<Record<string, unknown>>(`/comments/recipe/${recipeId}`, {
        content: newComment.trim(),
      });
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
      setTotal((n) => n + 1);
      setNewComment('');
      setStatusMessage(t('comment.posted'));
    } catch {
      setStatusMessage(t('comment.error'));
    } finally {
      setLoading(false);
    }
  }

  async function handleReplySubmit(e: React.FormEvent, parentCommentId: string) {
    e.preventDefault();
    if (!replyContent.trim() || replyLoading) return;
    setReplyLoading(true);
    setStatusMessage('');
    try {
      const data = await api.post<Record<string, unknown>>(`/comments/recipe/${recipeId}`, {
        content: replyContent.trim(),
        parentCommentId,
      });
      const optimisticReply: Comment = {
        ...(data as unknown as Comment),
        author: user
          ? {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
          }
          : undefined,
      };
      setComments((prev) =>
        prev.map((c) =>
          c.id === parentCommentId ? { ...c, replies: [...(c.replies ?? []), optimisticReply] } : c
        )
      );
      setReplyContent('');
      setReplyingToId(null);
      setStatusMessage(t('comment.replyPosted'));
    } catch {
      setStatusMessage(t('comment.error'));
    } finally {
      setReplyLoading(false);
    }
  }

  function isRecipeAuthor(comment: Comment) {
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
    const isReplyOpen = replyingToId === comment.id;
    const userCanReply = canReplyToComment(comment);

    return (
      <article
        key={comment.id}
        className='rounded-lg p-4'
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
        }}
        aria-label={`${t('comment.commentBy')} ${getAuthorName(comment)}`}
      >
        {/* Comment header */}
        <div className='flex items-center gap-2 mb-2'>
          <AuthorLink comment={comment} className='font-medium text-sm' />
          {isRecipeAuthor(comment) && <span className='badge text-xs'>{t('comment.op')}</span>}
          <span className='text-xs' style={{ color: 'var(--text-tertiary)' }}>
            {new Date(comment.createdAt).toLocaleDateString()}
          </span>
        </div>

        {/* Comment body -- inline markdown */}
        <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>
          {renderInlineMarkdown(comment.content)}
        </p>

        {/* Reply button on top-level comment */}
        {userCanReply && !isReplyOpen && (
          <button
            type='button'
            onClick={() => openReplyForm(comment.id)}
            className='mt-2 text-xs'
            style={{
              color: 'var(--accent-primary)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            {t('comment.reply')}
          </button>
        )}

        {/* Inline reply form */}
        {isReplyOpen && (
          <form onSubmit={(e) => handleReplySubmit(e, comment.id)} className='mt-3 ml-4'>
            <label htmlFor={`reply-comment-${comment.id}`} className='sr-only'>
              {t('comment.replyLabel')}
            </label>
            <textarea
              id={`reply-comment-${comment.id}`}
              value={replyContent}
              onChange={(e) =>
                setReplyContent(e.target.value)}
              placeholder={t('comment.writeReply')}
              className='input-field mb-2'
              rows={2}
              aria-required='true'
              // deno-lint-ignore no-explicit-any
              ref={(el: any) =>
                el?.focus()}
            />
            <div className='flex gap-2'>
              <button
                type='submit'
                className='btn-primary'
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.75rem' }}
                disabled={replyLoading || !replyContent.trim()}
              >
                {replyLoading ? t('comment.posting') : t('comment.postReply')}
              </button>
              <button
                type='button'
                className='btn-secondary'
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.75rem' }}
                onClick={() => {
                  setReplyingToId(null);
                  setReplyContent('');
                }}
              >
                {t('comment.cancel')}
              </button>
            </div>
          </form>
        )}

        {/* Replies */}
        {Array.isArray(comment.replies) && comment.replies.length > 0 && (
          <div className='mt-3 ml-4 flex flex-col gap-2'>
            {comment.replies.map((reply) => (
              <article
                key={reply.id}
                className='rounded p-3'
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-primary)',
                }}
                aria-label={`${t('comment.reply')} ${getAuthorName(reply)}`}
              >
                <div className='flex items-center gap-2 mb-1'>
                  <AuthorLink comment={reply} className='font-medium text-xs' />
                  {isRecipeAuthor(reply) && (
                    <span className='badge text-xs'>{t('comment.op')}</span>
                  )}
                  <span className='text-xs' style={{ color: 'var(--text-tertiary)' }}>
                    {new Date(reply.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {/* Reply body -- inline markdown */}
                <p className='text-xs' style={{ color: 'var(--text-secondary)' }}>
                  {renderInlineMarkdown(reply.content)}
                </p>
                {/* Reply button on a reply -- opens form on the parent, pre-fills @username */}
                {userCanReply && !isReplyOpen && (
                  <button
                    type='button'
                    onClick={() => openReplyForm(comment.id, getAuthorUsername(reply) ?? undefined)}
                    className='mt-1 text-xs'
                    style={{
                      color: 'var(--accent-primary)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    {t('comment.reply')}
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </article>
    );
  }

  return (
    <section aria-label={t('recipe.comments')}>
      <h3 className='text-lg font-semibold mb-4' style={{ color: 'var(--text-primary)' }}>
        {t('comment.count').replace('{count}', String(total))}
      </h3>

      <div aria-live='polite' aria-atomic='true' className='sr-only'>
        {statusMessage}
      </div>

      {isAuthenticated && (
        <form onSubmit={handleSubmit} className='mb-6'>
          <label htmlFor='new-comment' className='sr-only'>
            {t('comment.label')}
          </label>
          <textarea
            id='new-comment'
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder={t('comment.writeComment')}
            className='input-field mb-2'
            rows={3}
            aria-required='true'
          />
          <button type='submit' className='btn-primary' disabled={loading || !newComment.trim()}>
            {loading ? t('comment.posting') : t('comment.postComment')}
          </button>
        </form>
      )}

      <div className='flex flex-col gap-4'>
        {comments.map((comment) => renderComment(comment))}
      </div>

      {total > comments.length && (
        <div className='mt-4 text-center'>
          <button type='button' onClick={() => setPage((p) => p + 1)} className='btn-secondary'>
            {t('comment.loadMore')}
          </button>
        </div>
      )}
    </section>
  );
}
