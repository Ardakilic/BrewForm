import { Link } from 'react-router';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { AuthorButton } from '../ui/AuthorButton.tsx';

/**
 * Minimal author projection rendered by {@link RecipeCard}. A subset of the
 * shared `RecipeAuthorMiniSchema` — every recipe payload (list, feed,
 * equipment, coffee-variety) carries at least `{ username, displayName }`.
 */
export interface RecipeCardAuthor {
  username: string;
  displayName: string | null;
}

/**
 * Brew-metadata strip projection for {@link RecipeCard}. Satisfied by a
 * `recipeVersions` row (e.g. `RecipeWithVersionsOutput.versions[0]` from the
 * coffee-variety endpoint, which DOES carry version data — unlike
 * `GET /recipes`, whose absence of `currentVersion` is why the strip was
 * originally removed).
 */
export interface RecipeCardVersion {
  brewMethod: string;
  drinkType: string;
  rating: number | null;
}

/**
 * Minimal picked recipe shape accepted by {@link RecipeCard}. Deliberately a
 * subset of `RecipeListItemOutput` / `RecipeWithAuthorOutput` /
 * `RecipeWithVersionsOutput` so one card serves every recipe-list surface.
 * `forkCount` is optional (the public-profile projection omits it) and
 * `author` is optional (hidden entirely with `hideAuthor`).
 */
export interface RecipeCardRecipe {
  id: string;
  slug: string;
  title: string;
  likeCount: number;
  commentCount: number;
  forkCount?: number;
  author?: RecipeCardAuthor | null;
}

/** Props for {@link RecipeCard}. */
interface RecipeCardProps {
  recipe: RecipeCardRecipe;
  /** Omit the "by <author>" line (e.g. on the author's own profile). */
  hideAuthor?: boolean;
  /** Optional brew-method / drink-type / ★-rating strip. */
  version?: RecipeCardVersion | null;
}

/**
 * Renders a clickable recipe card with an inner author button.
 *
 * Uses a `<button>` (via {@link AuthorButton}) for the author link instead of
 * `<Link>` to avoid nested `<a>` elements (invalid HTML). The card itself is a
 * `<Link>` for native link behaviour (Ctrl+click / new tab), while the author
 * button uses `useNavigate` with `e.stopPropagation()` to prevent the outer
 * card navigation.
 *
 * The list endpoint (`GET /recipes`) does NOT return a per-item
 * `currentVersion` projection (see `recipe/model.ts findMany`), so the card
 * only renders the brew-method/drink-type/rating strip when a `version` is
 * passed explicitly (e.g. `r.versions[0]` from the coffee-variety endpoint).
 */
export function RecipeCard({ recipe, hideAuthor, version }: RecipeCardProps) {
  const { t } = useTranslation();
  const { author } = recipe;
  return (
    <Link to={`/recipes/${recipe.slug}`} className='card hover:shadow-lg transition-shadow'>
      <h3 className='font-semibold' style={{ color: 'var(--text-primary)' }}>{recipe.title}</h3>
      {!hideAuthor && (
        <p className='mt-1 text-sm' style={{ color: 'var(--text-secondary)' }}>
          {t('recipe.card.by')} {author ? <AuthorButton author={author} /> : 'unknown'}
        </p>
      )}
      {version && (
        <div
          className='mt-1 flex flex-wrap gap-1 text-xs'
          style={{ color: 'var(--text-tertiary)' }}
        >
          <span>{version.brewMethod.replace(/_/g, ' ')}</span>
          <span>•</span>
          <span>{version.drinkType.replace(/_/g, ' ')}</span>
          {version.rating && <span>• ★ {version.rating}</span>}
        </div>
      )}
      <div
        className='mt-2 flex items-center gap-2 text-xs'
        style={{ color: 'var(--text-tertiary)' }}
      >
        <span>❤️ {recipe.likeCount}</span>
        <span>💬 {recipe.commentCount}</span>
        {recipe.forkCount != null && <span>🍴 {recipe.forkCount}</span>}
      </div>
    </Link>
  );
}
