import type { CSSProperties } from 'react';
import type { Visibility } from '@brewform/shared/types';

/**
 * Maps a collection visibility to its badge emoji:
 * `public → 🌐`, `unlisted → 🔗`, `private`/`draft → 🔒`.
 *
 * Single source of truth for the identical ternary previously duplicated in
 * `CollectionCard`, `CollectionDetailPage`, and `AddToCollectionModal`. This is
 * the collection-specific emoji badge — intentionally distinct from the recipes'
 * `MetadataBadges` dot-badge design.
 */
export function visibilityEmoji(visibility: Visibility): string {
  return visibility === 'public' ? '🌐' : visibility === 'unlisted' ? '🔗' : '🔒';
}

/** Props for {@link CollectionVisibilityBadge}. */
interface CollectionVisibilityBadgeProps {
  visibility: Visibility;
  /** Wrapper classes (callers control sizing/spacing, e.g. `text-lg`, `ml-2 text-xs`). */
  className?: string;
  /** Wrapper inline styles (e.g. tertiary text color). */
  style?: CSSProperties;
  /** Optional tooltip; pass the raw visibility to expose it to assistive tech. */
  title?: string;
}

/** Renders the visibility emoji badge for a collection. */
export function CollectionVisibilityBadge(
  { visibility, className, style, title }: CollectionVisibilityBadgeProps,
) {
  return (
    <span className={className} style={style} title={title}>
      {visibilityEmoji(visibility)}
    </span>
  );
}
