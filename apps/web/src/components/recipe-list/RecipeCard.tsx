import { Link, useNavigate } from 'react-router';
import { AUTHOR_BUTTON_STYLE } from '../../components/recipe/RecipeCard.styles.ts';
import type { RecipeListItem } from '../../api/types.ts';

/**
 * Renders a clickable recipe card with an inner author button.
 *
 * Uses a `<button>` for the author link instead of `<Link>` to avoid
 * nested `<a>` elements (invalid HTML). The card itself is a `<Link>`
 * for native link behaviour (Ctrl+click / new tab), while the author
 * button uses `useNavigate` with `e.stopPropagation()` to prevent the
 * outer card navigation.
 */
export function RecipeCard({ recipe }: { recipe: RecipeListItem }) {
  const navigate = useNavigate();
  return (
    <Link to={`/recipes/${recipe.slug}`} className='card hover:shadow-lg transition-shadow'>
      <h3 className='font-semibold' style={{ color: 'var(--text-primary)' }}>{recipe.title}</h3>
      <p className='mt-1 text-sm' style={{ color: 'var(--text-secondary)' }}>
        by {recipe.author
          ? (
            <button
              type='button'
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/u/${recipe.author!.username}`);
              }}
              className='hover:underline'
              style={AUTHOR_BUTTON_STYLE}
            >
              {recipe.author.displayName || recipe.author.username}
            </button>
          )
          : (
            'unknown'
          )}
      </p>
      {recipe.currentVersion && (
        <div
          className='mt-1 flex flex-wrap gap-1 text-xs'
          style={{ color: 'var(--text-tertiary)' }}
        >
          <span>{recipe.currentVersion.brewMethod.replace(/_/g, ' ')}</span>
          <span>•</span>
          <span>{recipe.currentVersion.drinkType.replace(/_/g, ' ')}</span>
          {recipe.currentVersion.rating && <span>• ★ {recipe.currentVersion.rating}</span>}
        </div>
      )}
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
