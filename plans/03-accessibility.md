# Plan 03 -- Accessibility (WCAG 2.1 AA Compliance)

**Priority:** High
**Effort:** Medium (8-12 hours total)
**Dependencies:** None (all changes are frontend-only)
**Blocked by:** Nothing
**Branch:** `fix/accessibility-wcag`

---

## Overview

BrewForm has a solid accessibility foundation -- `<nav aria-label>` in Navbar, `<section>` usage in 7 files, `<aside>` in AdminLayout/RecipeListPage, and 81 `aria-*` attributes total. However, six gaps prevent WCAG 2.1 AA compliance: no skip navigation link, a hardcoded `lang` attribute that ignores locale changes, unlabeled form controls in the comment section, inconsistent focus indicator styles, missing `<article>` semantic elements, and empty avatar `alt` attributes.

---

## H3 -- No Skip Navigation Link (WCAG 2.4.1 Bypass Blocks)

**Status:** CONFIRMED

**Evidence:**
- `apps/web/src/components/layout/Layout.tsx:6-17` -- Renders `<Navbar />` then `<main className='flex-1'>`. No skip link. No `id` on `<main>`.
- Keyboard-only users must Tab through the entire Navbar (logo, 5+ nav links, theme toggle, locale toggle, auth buttons) before reaching page content on every navigation.

**Impact:** WCAG 2.4.1 Level A failure. Keyboard and screen reader users cannot bypass repetitive navigation. This is the single most common accessibility audit failure.

**Action Plan:**

### 1. Add i18n keys

**`packages/shared/src/i18n/en.json`** -- add:
```json
"a11y.skipToContent": "Skip to main content"
```

**`packages/shared/src/i18n/tr.json`** -- add:
```json
"a11y.skipToContent": "Ana iceriye gec"
```

### 2. Update Layout.tsx

Replace the full file `apps/web/src/components/layout/Layout.tsx`:

```tsx
import { Outlet } from 'react-router';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { CookieConsent } from '../CookieConsent';
import { EmailVerificationBanner } from '../EmailVerificationBanner';
import { useTranslation } from '../../contexts/I18nContext';

export function Layout() {
  const { t } = useTranslation();

  return (
    <div className='flex min-h-screen flex-col'>
      <a
        href='#main-content'
        className='sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-lg'
        style={{
          backgroundColor: 'var(--accent-primary)',
          color: 'var(--bg-primary)',
        }}
      >
        {t('a11y.skipToContent')}
      </a>
      <EmailVerificationBanner />
      <Navbar />
      <main id='main-content' className='flex-1' tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
      <CookieConsent />
    </div>
  );
}
```

**Key details:**
- `sr-only` hides the link visually; `focus:not-sr-only` reveals it when focused via Tab.
- `focus:fixed focus:top-4 focus:left-4 focus:z-50` positions it above all content when visible.
- `tabIndex={-1}` on `<main>` allows programmatic focus (the browser scrolls to `#main-content` on click).
- The skip link is the **first focusable element** in the DOM, before `<EmailVerificationBanner />` and `<Navbar />`.

**Effort:** Small (30 minutes)

---

## H4 -- `lang` Attribute Hardcoded (WCAG 3.1.1 Language of Page)

**Status:** CONFIRMED

**Evidence:**
- `apps/web/index.html:2` -- `<html lang="en" class="light">` is hardcoded.
- `apps/web/src/contexts/I18nContext.tsx:22-25` -- `setLocale` updates React state and `localStorage` but never touches `document.documentElement.lang`.
- When a user switches to Turkish, screen readers continue announcing content in English phonetics. Assistive technology relies on `lang` to select the correct pronunciation engine.

**Impact:** WCAG 3.1.1 Level A failure. Screen readers use the wrong language pronunciation for Turkish users. Also affects browser translation prompts and search engine language detection.

**Action Plan:**

Replace the full `I18nProvider` in `apps/web/src/contexts/I18nContext.tsx`:

```tsx
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { getAvailableLocales, t as translate } from '@brewform/shared/i18n';

type Locale = 'en' | 'tr';

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
  availableLocales: string[];
}

const I18nContext = createContext<I18nContextType | null>(null);

/** Maps locale codes to their text directionality. */
const LOCALE_DIR: Record<Locale, 'ltr' | 'rtl'> = {
  en: 'ltr',
  tr: 'ltr',
};

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const stored = localStorage.getItem('brewform_locale') as Locale | null;
    if (stored && getAvailableLocales().includes(stored)) return stored;
    return 'en';
  });

  // Sync locale to <html lang="..." dir="..."> on every change (including initial mount)
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = LOCALE_DIR[locale] ?? 'ltr';
  }, [locale]);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem('brewform_locale', newLocale);
  }, []);

  const t = useCallback((key: string) => translate(key, locale), [locale]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, availableLocales: getAvailableLocales() }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useTranslation must be used within I18nProvider');
  return context;
}
```

**Key details:**
- The `useEffect` runs on mount (syncs from `localStorage` value) and on every locale change.
- `LOCALE_DIR` is a lookup map. Both `en` and `tr` are `ltr`, but this future-proofs for RTL locales (Arabic, Hebrew) if added later.
- `document.documentElement` is the `<html>` element -- same element that `index.html` sets `lang="en"` on.

**Effort:** Small (20 minutes)

---

## H8 -- Comment Section Form Lacks Labels (WCAG 1.3.1 / 3.3.2)

**Status:** CONFIRMED

**Evidence:**
- `apps/web/src/components/recipe/CommentSection.tsx:337-343` -- Main comment `<textarea>` has `placeholder` but no `<label>` and no `aria-label`. Placeholder text disappears on input, leaving screen reader users with no field identification.
- `apps/web/src/components/recipe/CommentSection.tsx:244-254` -- Reply `<textarea>` also lacks any label. Only has `placeholder={t('comment.writeReply')}`.
- No `aria-invalid`, `aria-describedby`, or `aria-live` regions anywhere in CommentSection. Users get no accessible feedback when comments are posted or when errors occur.

**Impact:** WCAG 1.3.1 (Info and Relationships) and 3.3.2 (Labels or Instructions) Level A failures. Screen reader users cannot identify form fields. No accessible error or success feedback.

**Action Plan:**

### 1. Add i18n keys

**`packages/shared/src/i18n/en.json`** -- add:
```json
"comment.commentBy": "Comment by",
"comment.label": "Write a comment",
"comment.replyLabel": "Write a reply",
"comment.posted": "Comment posted successfully",
"comment.replyPosted": "Reply posted successfully",
"comment.error": "Failed to post comment. Please try again."
```

**`packages/shared/src/i18n/tr.json`** -- add:
```json
"comment.commentBy": "Yorum yazan",
"comment.label": "Yorum yaz",
"comment.replyLabel": "Yanit yaz",
"comment.posted": "Yorum basariyla gonderildi",
"comment.replyPosted": "Yanit basariyla gonderildi",
"comment.error": "Yorum gonderilemedi. Lutfen tekrar deneyin."
```

### 2. Update CommentSection.tsx

Replace the full `CommentSection` component in `apps/web/src/components/recipe/CommentSection.tsx`:

```tsx
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

      {/* Live region for async feedback */}
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
```

**Changes made (diff summary):**
1. **Main textarea** -- Added `<label htmlFor='new-comment' className='sr-only'>` and `id='new-comment'` on the textarea. Added `aria-required='true'`.
2. **Reply textarea** -- Added `<label htmlFor={`reply-comment-${comment.id}`} className='sr-only'>` and matching `id` on the textarea. Added `aria-required='true'`.
3. **Live region** -- Added `<div aria-live='polite' aria-atomic='true' className='sr-only'>{statusMessage}</div>` before the form. This announces "Comment posted successfully" or "Failed to post comment" to screen readers.
4. **Status tracking** -- Added `statusMessage` state. Updated `handleSubmit` and `handleReplySubmit` to set success/error messages.
5. **Semantic HTML** -- Changed top-level comment `<div>` to `<article aria-label>` and reply `<div>` to `<article aria-label>` (also addresses L12).
6. **Section wrapper** -- Wrapped the entire return in `<section aria-label={t('recipe.comments')}>`.

**Effort:** Medium (1-2 hours)

---

## L3 -- `:focus` vs `:focus-visible` Inconsistency

**Status:** CONFIRMED

**Evidence:**
- `apps/web/src/styles/globals.css:144` -- `.input-field:focus` uses `:focus` which triggers on every click/tap, showing focus rings on mouse users.
- Modern best practice: `:focus-visible` only shows focus indicators for keyboard navigation, not mouse clicks. All major browsers support it (Chrome 86+, Firefox 85+, Safari 15.4+).
- No global `:focus-visible` fallback exists for interactive elements that lack explicit focus styles (links, buttons outside `.btn-primary`/`.btn-secondary`).

**Impact:** Mouse users see distracting focus rings on every input click. Keyboard users may lack visible focus on non-input elements. Inconsistent with WCAG 2.4.7 (Focus Visible).

**Action Plan:**

Update `apps/web/src/styles/globals.css`. Replace the existing `.input-field:focus` block (lines 144-148) and add a global `:focus-visible` fallback.

**Full updated globals.css `@layer base` focus section** (replacing lines 135-159):

```css
  .input-field {
    background-color: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: 0.5rem;
    padding: 0.5rem 0.75rem;
    color: var(--text-primary);
    width: 100%;
    transition: border-color 0.15s ease;
  }
  .input-field:focus-visible {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-primary) 10%, transparent);
  }

  .badge {
    display: inline-flex;
    align-items: center;
    padding: 0.125rem 0.5rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 500;
    background-color: var(--accent-primary);
    color: var(--bg-primary);
  }

  /* Global focus-visible outline for all interactive elements (WCAG 2.4.7) */
  :focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: 2px;
  }

  /* Remove the generic outline for elements that define their own focus styles */
  .input-field:focus-visible,
  .btn-primary:focus-visible,
  .btn-secondary:focus-visible {
    outline: none;
  }

  .btn-primary:focus-visible {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-primary) 30%, transparent);
  }

  .btn-secondary:focus-visible {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-primary) 15%, transparent);
  }
```

**Key details:**
- The global `:focus-visible` rule gives every `<a>`, `<button>`, `<select>`, `<summary>` etc. a visible keyboard focus indicator automatically.
- Elements with custom focus styles (`.input-field`, `.btn-primary`, `.btn-secondary`) opt out of the generic outline and use `box-shadow` instead, which respects `border-radius`.
- Mouse clicks no longer trigger the focus ring on text inputs.

**Effort:** Small (20 minutes)

---

## L12 -- Missing Semantic `<article>` Elements

**Status:** CONFIRMED

**Evidence:**
- Grep for `<article` across `apps/web/src/` -- **zero results** (before the H8 fix above).
- `<nav aria-label>` exists in Navbar. `<section>` used in 6 files. `<aside>` in AdminLayout and RecipeListPage. But `<article>` is absent everywhere.
- `apps/web/src/pages/recipes/RecipeDetailPage.tsx:109-383` -- The entire recipe detail content is wrapped in a plain `<div>`. No `<article>` element.

**Impact:** Screen readers cannot convey document structure landmarks for self-contained content. RSS readers and content extractors cannot identify article boundaries. Affects WCAG 1.3.1 (Info and Relationships) Level A.

**Action Plan:**

### 1. RecipeDetailPage.tsx -- Wrap recipe content in `<article>`

In `apps/web/src/pages/recipes/RecipeDetailPage.tsx`, change the outermost `<div>` wrapper (line 109) of the recipe content to `<article>`:

**Before (line 109):**
```tsx
    <div>
```

**After:**
```tsx
    <article aria-label={recipe.title}>
```

**Before (line 383):**
```tsx
    </div>
```

**After:**
```tsx
    </article>
```

This wraps the entire recipe (header, stat cards, bean section, brew timeline, equipment, preparation notes, tasting notes, comments) in a single `<article>` landmark.

### 2. CommentSection.tsx -- Already addressed in H8

The H8 fix above already changes comment `<div>` wrappers to `<article aria-label>` elements for both top-level comments and replies.

### 3. Verify existing `<section>` usage has labels

The existing `<section>` elements should have `aria-label` or `aria-labelledby`. Grep shows most already do (e.g., `<section className='card' aria-label='Preparation notes'>` at RecipeDetailPage.tsx:226). No additional changes needed.

**Effort:** Small (15 minutes)

---

## N3 -- Empty `alt` Attributes on User Avatars

**Status:** CONFIRMED

**Evidence:**
- `apps/web/src/pages/admin/AdminUserDetailPage.tsx:152` -- `<img src={user.avatarUrl} alt='' className='w-20 h-20 rounded-full object-cover' />`
- `apps/web/src/pages/users/UserProfilePage.tsx:102` -- `<img src={profile.avatarUrl} alt='' className='w-16 h-16 rounded-full object-cover' />`
- Empty `alt=""` marks images as **decorative** (WCAG spec), telling screen readers to skip them entirely. But these are the primary visual identifier for a user on their profile page -- they are **not** decorative.

**Impact:** Screen reader users on user profile pages hear no indication that an avatar image exists. Low severity because surrounding text provides the user's name, but technically incorrect per WCAG 1.1.1 (Non-text Content).

**Action Plan:**

### 1. AdminUserDetailPage.tsx (line 150-153)

**Before:**
```tsx
              <img
                src={user.avatarUrl}
                alt=''
                className='w-20 h-20 rounded-full object-cover'
              />
```

**After:**
```tsx
              <img
                src={user.avatarUrl}
                alt={`${user.displayName || user.username}'s avatar`}
                className='w-20 h-20 rounded-full object-cover'
              />
```

### 2. UserProfilePage.tsx (line 100-103)

**Before:**
```tsx
                <img
                  src={profile.avatarUrl}
                  alt=''
                  className='w-16 h-16 rounded-full object-cover'
                />
```

**After:**
```tsx
                <img
                  src={profile.avatarUrl}
                  alt={`${profile.displayName || profile.username}'s avatar`}
                  className='w-16 h-16 rounded-full object-cover'
                />
```

**Note on i18n:** The `alt` text uses a simple English possessive pattern (`{name}'s avatar`). For full i18n support, add these keys:

**`packages/shared/src/i18n/en.json`:**
```json
"a11y.userAvatar": "{name}'s avatar"
```

**`packages/shared/src/i18n/tr.json`:**
```json
"a11y.userAvatar": "{name} avatari"
```

Then in `UserProfilePage.tsx` (which already imports `useTranslation`), use:
```tsx
alt={t('a11y.userAvatar').replace('{name}', profile.displayName || profile.username)}
```

For `AdminUserDetailPage.tsx`, which does not currently use `useTranslation`, the English-only string is acceptable since the admin panel is not localized. If the admin panel is later localized, add the import then.

**Effort:** Small (15 minutes)

---

## Summary of All i18n Keys to Add

### `packages/shared/src/i18n/en.json` -- add these entries:

```json
"a11y.skipToContent": "Skip to main content",
"a11y.userAvatar": "{name}'s avatar",
"comment.commentBy": "Comment by",
"comment.label": "Write a comment",
"comment.replyLabel": "Write a reply",
"comment.posted": "Comment posted successfully",
"comment.replyPosted": "Reply posted successfully",
"comment.error": "Failed to post comment. Please try again."
```

### `packages/shared/src/i18n/tr.json` -- add these entries:

```json
"a11y.skipToContent": "Ana iceriye gec",
"a11y.userAvatar": "{name} avatari",
"comment.commentBy": "Yorum yazan",
"comment.label": "Yorum yaz",
"comment.replyLabel": "Yanit yaz",
"comment.posted": "Yorum basariyla gonderildi",
"comment.replyPosted": "Yanit basariyla gonderildi",
"comment.error": "Yorum gonderilemedi. Lutfen tekrar deneyin."
```

---

## Files Modified (Complete List)

| File | Change |
|------|--------|
| `apps/web/src/components/layout/Layout.tsx` | Add skip link, `id`/`tabIndex` on `<main>` |
| `apps/web/src/contexts/I18nContext.tsx` | Add `useEffect` to sync `lang`/`dir` to `<html>` |
| `apps/web/src/components/recipe/CommentSection.tsx` | Add labels, aria-live, `<article>` wrappers |
| `apps/web/src/styles/globals.css` | `:focus` to `:focus-visible`, global outline |
| `apps/web/src/pages/recipes/RecipeDetailPage.tsx` | Outer `<div>` to `<article>` |
| `apps/web/src/pages/admin/AdminUserDetailPage.tsx` | Descriptive avatar `alt` text |
| `apps/web/src/pages/users/UserProfilePage.tsx` | Descriptive avatar `alt` text |
| `packages/shared/src/i18n/en.json` | 8 new keys |
| `packages/shared/src/i18n/tr.json` | 8 new keys |

---

## Implementation Order

1. **H4 -- lang sync** (standalone, no dependencies, 20 min)
2. **H3 -- skip link** (requires i18n keys from step 1's pattern, 30 min)
3. **L3 -- focus-visible** (CSS-only, no dependencies, 20 min)
4. **N3 -- avatar alt** (two one-line changes, 15 min)
5. **L12 -- article elements** (one-line change in RecipeDetailPage, 15 min)
6. **H8 -- comment section** (largest change, benefits from i18n keys already added, 1-2 hours)

---

## Testing Checklist

- [ ] **Skip link:** Tab from page load -- first focus should reveal "Skip to main content" link. Pressing Enter scrolls to `<main>`.
- [ ] **Lang sync:** Switch locale to Turkish in UI. Inspect `<html>` element -- `lang` should be `"tr"`, `dir` should be `"ltr"`.
- [ ] **Comment labels:** Use screen reader (VoiceOver/NVDA). Navigate to comment textarea -- should announce "Write a comment". Post a comment -- should announce "Comment posted successfully".
- [ ] **Focus-visible:** Click on a text input with mouse -- no focus ring. Tab to same input -- focus ring appears. Tab to a `<button>` or `<a>` -- 2px accent-colored outline appears.
- [ ] **Article landmarks:** Open VoiceOver rotor (VO+U) on recipe detail page -- should list `<article>` landmark. Each comment should also be listed.
- [ ] **Avatar alt:** Navigate to user profile with screen reader -- should announce "[Name]'s avatar" for the avatar image.
- [ ] **Lighthouse audit:** Run Lighthouse accessibility audit on recipe detail page -- target 95+ score.
