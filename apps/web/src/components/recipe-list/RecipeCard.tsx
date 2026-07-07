import { Link, useNavigate } from 'react-router';
import { AUTHOR_BUTTON_STYLE } from '../../components/recipe/RecipeCard.styles.ts';
import type { RecipeListItemOutput } from '@brewform/shared/schemas';

/**
 * Renders a clickable recipe card with an inner author button.
 *
 * Uses a `<button>` for the author link instead of `<Link>` to avoid
 * nested `<a>` elements (invalid HTML). The card itself is a `<Link>`
 * for native link behaviour (Ctrl+click / new tab), while the author
 * button uses `useNavigate` with `e.stopPropagation()` to prevent the
 * outer card navigation.
 *
 * Note: the list endpoint (`GET /recipes`) does NOT return a per-item
 * `currentVersion` projection (see `recipe/model.ts findMany`), so the
 * card no longer renders a brew-method/drink-type/rating strip — the
 * shared `RecipeListItemOutput` correctly models this absence. If a
 * future enrichment adds those fields, extend the schema and restore
 * the strip.
 */
export function RecipeCard({ recipe }: { recipe: RecipeListItemOutput }) {
  const navigate = useNavigate();
  const { author } = recipe;
  return (
    <Link to={`/recipes/${recipe.slug}`} className='card hover:shadow-lg transition-shadow'>
      <h3 className='font-semibold' style={{ color: 'var(--text-primary)' }}>{recipe.title}</h3>
      <p className='mt-1 text-sm' style={{ color: 'var(--text-secondary)' }}>
        by {author
          ? (
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
          )
          : (
            'unknown'
          )}
      </p>
      <div
        className='mt-2 flex items-center gap-2 text-xs'
        style={{ color: 'var(--text-tertiary)' }}
      >
        <span>❤️ {recipe.likeCount}</span>
        <span>💬 {recipe.commentCount}</span>
        <span>🍴 {recipe.forkCount}</span>
      </div>
    </Link>
  );
}
