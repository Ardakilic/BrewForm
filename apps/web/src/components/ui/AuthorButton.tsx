import { useNavigate } from 'react-router';

/**
 * Minimal author projection accepted by {@link AuthorButton}. Mirrors the
 * shared `RecipeAuthorMiniSchema` (`{ username, displayName }`) used by the
 * recipe/collection list payloads; callers may pass a superset (e.g. with
 * `avatarUrl` or `id`).
 */
export interface AuthorButtonAuthor {
  username: string;
  displayName: string | null;
}

/**
 * Canonical author-link button style. The accent color `var(--accent-primary)`
 * is the single source of truth — it supersedes the drifted `color: 'inherit'`
 * that `CollectionCard` previously used inline.
 */
export const AUTHOR_BUTTON_STYLE = {
  color: 'var(--accent-primary)',
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  font: 'inherit',
} as const;

/**
 * Renders a clickable author link as a `<button>` (with `useNavigate` +
 * `e.stopPropagation()`) instead of a nested `<a>`, so it can live inside a
 * card that is itself a `<Link>` without producing invalid nested anchors.
 * The canonical stopPropagation author button shared by `RecipeCard` and
 * `CollectionCard`.
 */
export function AuthorButton({ author }: { author: AuthorButtonAuthor }) {
  const navigate = useNavigate();
  return (
    <button
      type='button'
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/u/${author.username}`);
      }}
      className='hover:underline'
      style={AUTHOR_BUTTON_STYLE}
    >
      {author.displayName || author.username}
    </button>
  );
}
