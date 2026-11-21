import { MAX_REPLIES_PER_COMMENT } from '@brewform/shared/constants';
import type { CommentWithAuthorOutput, CommentWithRepliesOutput } from '@brewform/shared/schemas';
import { useEffect, useRef, useState } from 'react';
import { Link, useFetcher } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import type {
  createCommentAction,
  deleteCommentAction,
  listCommentsLoader,
} from '../../routes/comments.ts';
import { formatDate } from '../../utils/format.ts';
import { useToast } from '../ui/Toast.tsx';

const log = createLogger('CommentSection');

interface Props {
  recipeId: string;
  recipeAuthorId: string;
  initialComments: {
    data: CommentWithRepliesOutput[];
    meta: { pagination: { total: number; page: number; perPage: number; totalPages: number } };
  };
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

  for (const match of text.matchAll(pattern)) {
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

/**
 * Merges a revalidated first page into the accumulated comment list: the fresh page-1
 * comments first (server order), then every previously shown comment that is not on the
 * fresh page (comments from later "Load more" pages and ones pushed off page 1), so loaded
 * pages survive a revalidation instead of collapsing back to page 1.
 */
function mergeFirstPage(
  prev: CommentWithRepliesOutput[],
  fresh: CommentWithRepliesOutput[],
): CommentWithRepliesOutput[] {
  const freshIds = new Set(fresh.map((c) => c.id));
  return [...fresh, ...prev.filter((c) => !freshIds.has(c.id))];
}

/** The author's username for a profile link or a reply mention; `null` for a deleted account. */
function getAuthorUsername(comment: CommentWithAuthorOutput): string | null {
  return comment.author?.username || null;
}

/**
 * The display name of a comment's author: display name, then username, and `deletedLabel`
 * ("Deleted user") when the API returned `author: null` for a deleted account.
 */
function getAuthorName(comment: CommentWithAuthorOutput, deletedLabel: string): string {
  return comment.author?.displayName || comment.author?.username || deletedLabel;
}

/**
 * The author of a comment: a profile link for a live account, plain text (no link) with the
 * "Deleted user" label when the account was deleted.
 */
function AuthorLink({
  comment,
  deletedLabel,
  className,
}: {
  comment: CommentWithAuthorOutput;
  deletedLabel: string;
  className?: string;
}) {
  const username = getAuthorUsername(comment);
  const name = getAuthorName(comment, deletedLabel);
  if (username) {
    return (
      <Link
        to={`/u/${username}`}
        className={`${className ?? ''} text-[color:var(--accent-primary)]`}
      >
        {name}
      </Link>
    );
  }
  return <span className={`${className ?? ''} text-[color:var(--text-primary)]`}>{name}</span>;
}

// ---------------------------------------------------------------------------
// CommentSection
// ---------------------------------------------------------------------------
/**
 * Threaded comment section for a recipe: paginated list, top-level and reply forms with
 * limited inline markdown, and optimistic delete with snapshot rollback. Mutations go through
 * fetchers to the comment route actions (`routes/comments.ts`), submitted with
 * `defaultShouldRevalidate: false` (the section settles itself from the result, so no loader
 * or fetcher re-runs), which return `{ ok: true, … } | { ok: false, error }`: a failed post keeps the typed text and toasts
 * `comment.error`, a failed delete restores the snapshot and toasts `comment.deleteFailed`.
 * When the recipe loader revalidates, the fresh first page is merged into the loaded pages
 * (see {@link mergeFirstPage}); the list resets only when `recipeId` changes.
 */
export function CommentSection({ recipeId, recipeAuthorId, initialComments }: Props) {
  const { user, isAuthenticated } = useAuth();
  const { t, locale } = useTranslation();
  const toast = useToast();
  const [comments, setComments] = useState<CommentWithRepliesOutput[]>(initialComments.data);
  const [newComment, setNewComment] = useState('');
  const [page, setPage] = useState(initialComments.meta.pagination.page);
  const [total, setTotal] = useState(initialComments.meta.pagination.total);
  // replyingToId = the TOP-LEVEL comment id the form is attached to
  // replyMention = the @username pre-filled when replying to a reply
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const submitFetcher = useFetcher<typeof createCommentAction>();
  const deleteFetcher = useFetcher<typeof deleteCommentAction>();
  const loadMoreFetcher = useFetcher<typeof listCommentsLoader>();
  const syncedRecipeId = useRef(recipeId);

  const submitIntent = useRef<string | { type: 'reply'; parentCommentId: string } | null>(null);
  const deleteSnapshotRef = useRef<{ comments: CommentWithRepliesOutput[]; total: number } | null>(
    null,
  );

  // New loader data: a different recipe resets the list; a revalidation of the same recipe
  // merges its fresh first page into the loaded pages and keeps any typed text.
  useEffect(() => {
    if (syncedRecipeId.current !== recipeId) {
      syncedRecipeId.current = recipeId;
      setComments(initialComments.data);
      setPage(initialComments.meta.pagination.page);
      setNewComment('');
    } else {
      setComments((prev) => mergeFirstPage(prev, initialComments.data));
    }
    setTotal(initialComments.meta.pagination.total);
  }, [initialComments, recipeId]);

  useEffect(() => {
    if (deleteFetcher.state !== 'idle' || !deleteFetcher.data || !deleteSnapshotRef.current) {
      return;
    }
    const snapshot = deleteSnapshotRef.current;
    deleteSnapshotRef.current = null;
    if (deleteFetcher.data.ok) {
      log.debug({ recipeId }, 'handleDelete settled successfully');
      return;
    }
    log.debug({ recipeId }, 'handleDelete rolled back');
    setComments(snapshot.comments);
    setTotal(snapshot.total);
    toast.error('comment.deleteFailed');
  }, [deleteFetcher.state, deleteFetcher.data, recipeId, toast]);

  useEffect(() => {
    if (!statusMessage) return;
    const t = setTimeout(() => setStatusMessage(''), 5000);
    return () => clearTimeout(t);
  }, [statusMessage]);

  useEffect(() => {
    if (replyingToId !== null) {
      textareaRef.current?.focus();
    }
  }, [replyingToId]);

  // Process submitFetcher completion
  useEffect(() => {
    if (submitFetcher.state !== 'idle' || !submitFetcher.data || !submitIntent.current) return;
    const intent = submitIntent.current;
    submitIntent.current = null;
    const result = submitFetcher.data;
    if (!result.ok) {
      // Keep the typed comment or reply (and the open reply form) so the user can retry.
      log.debug({ recipeId }, 'comment submit failed');
      toast.error('comment.error');
      return;
    }
    const data = result.comment;

    if (typeof intent === 'string') {
      // Top-level comment: API returns `CommentOutput` (no `author`/`replies`);
      // the client wraps it with the local user's author projection and an
      // empty replies array so the optimistic insert matches the list shape.
      const comment: CommentWithRepliesOutput = {
        ...data,
        author: user
          ? {
              id: user.id,
              username: user.username,
              displayName: user.displayName,
              avatarUrl: user.avatarUrl,
            }
          : null,
        replies: [],
        hasMoreReplies: false,
      };
      setComments((prev) => [comment, ...prev]);
      setTotal((n) => n + 1);
      setNewComment('');
      setStatusMessage(t('comment.posted'));
    } else {
      // Reply: same wrapping as above; replies are appended to the parent.
      const reply: CommentWithRepliesOutput = {
        ...data,
        author: user
          ? {
              id: user.id,
              username: user.username,
              displayName: user.displayName,
              avatarUrl: user.avatarUrl,
            }
          : null,
        replies: [],
        hasMoreReplies: false,
      };
      setComments((prev) =>
        prev.map((c) =>
          c.id === intent.parentCommentId ? { ...c, replies: [...(c.replies ?? []), reply] } : c,
        ),
      );
      setReplyContent('');
      setReplyingToId(null);
      setStatusMessage(t('comment.replyPosted'));
    }
  }, [submitFetcher.state, submitFetcher.data, user, t, toast, recipeId]);

  // Process loadMoreFetcher completion
  useEffect(() => {
    if (loadMoreFetcher.state !== 'idle' || !loadMoreFetcher.data) return;
    const result = loadMoreFetcher.data;
    if (!Array.isArray(result.data)) return;
    // Skip comments already shown (a revalidated first page may have pulled some forward).
    setComments((prev) => {
      const shown = new Set(prev.map((c) => c.id));
      return [...prev, ...result.data.filter((c) => !shown.has(c.id))];
    });
    setPage(result.meta.pagination.page);
    setTotal(result.meta.pagination.total);
  }, [loadMoreFetcher.state, loadMoreFetcher.data]);

  // A user can reply if they are: the recipe owner, an admin, OR the author of the top-level comment
  function canReplyToComment(topLevelComment: CommentWithRepliesOutput): boolean {
    if (!isAuthenticated || user == null) return false;
    if (user.id === recipeAuthorId) return true;
    if (user.isAdmin === true) return true;
    if (user.id === topLevelComment.authorId) return true;
    return false;
  }

  function openReplyForm(topLevelCommentId: string, mentionUsername?: string) {
    setReplyingToId(topLevelCommentId);
    setReplyContent(mentionUsername ? `@${mentionUsername} ` : '');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim() || submitFetcher.state !== 'idle') return;
    setStatusMessage('');
    submitIntent.current = 'comment';
    submitFetcher.submit(
      { content: newComment.trim() },
      {
        method: 'post',
        action: `/comments/recipe/${recipeId}`,
        encType: 'application/x-www-form-urlencoded',
        defaultShouldRevalidate: false,
      },
    );
  }

  function handleReplySubmit(e: React.FormEvent, parentCommentId: string) {
    e.preventDefault();
    if (!replyContent.trim() || submitFetcher.state !== 'idle') return;
    setStatusMessage('');
    submitIntent.current = { type: 'reply', parentCommentId };
    submitFetcher.submit(
      { content: replyContent.trim(), parentCommentId },
      {
        method: 'post',
        action: `/comments/recipe/${recipeId}`,
        encType: 'application/x-www-form-urlencoded',
        defaultShouldRevalidate: false,
      },
    );
  }

  function handleDelete(commentId: string) {
    if (deleteFetcher.state !== 'idle') return;
    log.debug({ recipeId, commentId }, 'handleDelete started');
    deleteSnapshotRef.current = { comments, total };
    deleteFetcher.submit(null, {
      method: 'delete',
      action: `/comments/${commentId}`,
      defaultShouldRevalidate: false,
    });
    setComments((prev) => {
      const isTopLevel = prev.some((c) => c.id === commentId);
      if (isTopLevel) setTotal((n) => Math.max(0, n - 1));
      return prev
        .filter((c) => c.id !== commentId)
        .map((c) => ({
          ...c,
          replies: c.replies?.filter((r) => r.id !== commentId),
        }));
    });
  }

  function isRecipeAuthor(comment: CommentWithAuthorOutput) {
    return comment.authorId === recipeAuthorId;
  }

  const deletedLabel = t('common.deletedUser');

  function renderComment(comment: CommentWithRepliesOutput) {
    const isReplyOpen = replyingToId === comment.id;
    const userCanReply = canReplyToComment(comment);
    const userIsCommentAuthor = isAuthenticated && user != null && user.id === comment.authorId;

    return (
      <article
        key={comment.id}
        className="rounded-lg p-4 bg-[color:var(--bg-secondary)] border border-[color:var(--border-primary)]"
        aria-label={`${t('comment.commentBy')} ${getAuthorName(comment, deletedLabel)}`}
      >
        {/* Comment header */}
        <div className="flex items-center gap-2 mb-2">
          <AuthorLink
            comment={comment}
            deletedLabel={deletedLabel}
            className="font-medium text-sm"
          />
          {isRecipeAuthor(comment) && <span className="badge text-xs">{t('comment.op')}</span>}
          <span className="text-xs text-[color:var(--text-tertiary)]">
            {formatDate(comment.createdAt, locale)}
          </span>
        </div>

        {/* Comment body -- inline markdown */}
        <p className="text-sm text-[color:var(--text-secondary)]">
          {renderInlineMarkdown(comment.content)}
        </p>

        {/* Reply button on top-level comment */}
        {userCanReply && !isReplyOpen && (
          <button
            type="button"
            onClick={() => openReplyForm(comment.id)}
            className="mt-2 text-xs text-[color:var(--accent-primary)] bg-transparent border-none cursor-pointer p-0"
          >
            {t('comment.reply')}
          </button>
        )}

        {/* Delete button for own comments */}
        {userIsCommentAuthor && (
          <button
            type="button"
            onClick={() => handleDelete(comment.id)}
            disabled={deleteFetcher.state !== 'idle'}
            className="mt-2 ml-2 text-xs text-[color:var(--error)] bg-transparent border-none cursor-pointer p-0"
          >
            {t('common.delete')}
          </button>
        )}

        {/* Inline reply form */}
        {isReplyOpen && (
          <form onSubmit={(e) => handleReplySubmit(e, comment.id)} className="mt-3 ml-4">
            <label htmlFor={`reply-comment-${comment.id}`} className="sr-only">
              {t('comment.replyLabel')}
            </label>
            <textarea
              id={`reply-comment-${comment.id}`}
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              placeholder={t('comment.writeReply')}
              className="input-field mb-2"
              rows={2}
              aria-required="true"
              ref={textareaRef}
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="btn-primary text-xs py-1 px-3"
                disabled={submitFetcher.state !== 'idle' || !replyContent.trim()}
              >
                {submitFetcher.state !== 'idle' ? t('comment.posting') : t('comment.postReply')}
              </button>
              <button
                type="button"
                className="btn-secondary text-xs py-1 px-3"
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
          <div className="mt-3 ml-4 flex flex-col gap-2">
            {comment.replies.map((reply) => {
              const userIsReplyAuthor =
                isAuthenticated && user != null && user.id === reply.authorId;

              return (
                <article
                  key={reply.id}
                  className="rounded p-3 bg-[color:var(--bg-tertiary)] border border-[color:var(--border-primary)]"
                  aria-label={t('comment.replyBy').replace(
                    '{name}',
                    getAuthorName(reply, deletedLabel),
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <AuthorLink
                      comment={reply}
                      deletedLabel={deletedLabel}
                      className="font-medium text-xs"
                    />
                    {isRecipeAuthor(reply) && (
                      <span className="badge text-xs">{t('comment.op')}</span>
                    )}
                    <span className="text-xs text-[color:var(--text-secondary)]">
                      {formatDate(reply.createdAt, locale)}
                    </span>
                  </div>
                  {/* Reply body -- inline markdown */}
                  <p className="text-xs text-[color:var(--text-secondary)]">
                    {renderInlineMarkdown(reply.content)}
                  </p>
                  {/* Reply button on a reply -- opens form on the parent, pre-fills @username */}
                  {userCanReply && !isReplyOpen && (
                    <button
                      type="button"
                      onClick={() =>
                        openReplyForm(comment.id, getAuthorUsername(reply) ?? undefined)
                      }
                      className="mt-1 text-xs text-[color:var(--accent-primary)] bg-transparent border-none cursor-pointer p-0"
                    >
                      {t('comment.reply')}
                    </button>
                  )}
                  {/* Delete button for own replies */}
                  {userIsReplyAuthor && (
                    <button
                      type="button"
                      onClick={() => handleDelete(reply.id)}
                      disabled={deleteFetcher.state !== 'idle'}
                      className="mt-1 ml-2 text-xs text-[color:var(--error-on-raised)] bg-transparent border-none cursor-pointer p-0"
                    >
                      {t('common.delete')}
                    </button>
                  )}
                </article>
              );
            })}
            {comment.hasMoreReplies && (
              <p className="text-xs text-[color:var(--text-secondary)]">
                {t('comment.repliesTruncated').replace('{count}', String(MAX_REPLIES_PER_COMMENT))}
              </p>
            )}
          </div>
        )}
      </article>
    );
  }

  return (
    <section aria-label={t('recipe.comments')}>
      <h3 className="text-lg font-semibold mb-4 text-[color:var(--text-primary)]">
        {t('comment.count').replace('{count}', String(total))}
      </h3>

      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {statusMessage}
      </div>

      {isAuthenticated && (
        <form onSubmit={handleSubmit} className="mb-6">
          <label htmlFor="new-comment" className="sr-only">
            {t('comment.label')}
          </label>
          <textarea
            id="new-comment"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder={t('comment.writeComment')}
            className="input-field mb-2"
            rows={3}
            aria-required="true"
          />
          <button
            type="submit"
            className="btn-primary"
            disabled={submitFetcher.state !== 'idle' || !newComment.trim()}
          >
            {submitFetcher.state !== 'idle' ? t('comment.posting') : t('comment.postComment')}
          </button>
        </form>
      )}

      <div className="flex flex-col gap-4">{comments.map((comment) => renderComment(comment))}</div>

      {total > comments.length && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => {
              if (loadMoreFetcher.state !== 'idle') return;
              loadMoreFetcher.load(`/comments/recipe/${recipeId}?page=${page + 1}`);
            }}
            className="btn-secondary"
            disabled={loadMoreFetcher.state !== 'idle'}
          >
            {t('comment.loadMore')}
          </button>
        </div>
      )}
    </section>
  );
}
