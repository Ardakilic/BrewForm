import { Link } from 'react-router';

interface MetadataBadgesProps {
  author: { username: string; displayName: string | null } | null;
  visibility: string;
  brewMethod: string | null | undefined;
  versionNumber: number;
  versionCount: number;
  onVersionHistoryClick?: () => void;
}

function toTitleCase(str: string): string {
  return str
    .replace(/_/g, ' ')
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

// Dot color for each visibility state
const VISIBILITY_DOT_COLORS: Record<string, string> = {
  public: '#22c55e', // green
  unlisted: '#f59e0b', // yellow/amber
  private: '#a8a29e', // gray
  draft: '#a8a29e', // gray
};

/**
 * Badge row for a recipe header: author link, colour-dotted visibility
 * badge (dashed for drafts), brew method, and a version badge that
 * opens version history when prior versions exist.
 */
export function MetadataBadges({
  author,
  visibility,
  brewMethod,
  versionNumber,
  versionCount,
  onVersionHistoryClick,
}: MetadataBadgesProps) {
  const dotColor = VISIBILITY_DOT_COLORS[visibility] ?? VISIBILITY_DOT_COLORS['draft'];
  const isDraft = visibility === 'draft';
  const priorVersions = versionCount - 1;

  return (
    <div className='flex flex-wrap items-center gap-2 text-[color:var(--text-secondary)]'>
      {/* Author badge */}
      {author != null && (
        <Link
          to={`/u/${author.username}`}
          className='inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-[color:var(--bg-secondary)] text-[color:var(--text-secondary)]'
        >
          {author.displayName ?? author.username}
        </Link>
      )}

      {author != null && (
        <span className='text-xs text-[color:var(--text-tertiary)]'>
          •
        </span>
      )}

      {/* Visibility badge — draft gets a dashed border */}
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium bg-[color:var(--bg-secondary)] text-[color:var(--text-secondary)] ${
          isDraft ? 'border border-dashed border-[color:var(--border-primary)]' : ''
        }`}
      >
        <span
          className='inline-block rounded-full w-2 h-2 shrink-0'
          style={{ backgroundColor: dotColor }}
          aria-hidden='true'
        />
        {visibility.charAt(0).toUpperCase() + visibility.slice(1)}
      </span>

      {/* Brew method badge */}
      {brewMethod != null && (
        <>
          <span className='text-xs text-[color:var(--text-tertiary)]'>
            •
          </span>
          <span className='inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-[color:var(--bg-secondary)] text-[color:var(--text-secondary)]'>
            {toTitleCase(brewMethod)}
          </span>
        </>
      )}

      {/* Version info — only shown when there are multiple versions */}
      {versionCount > 1 && (
        <>
          <span className='text-xs text-[color:var(--text-tertiary)]'>
            •
          </span>
          <span className='inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-[color:var(--bg-tertiary)] text-[color:var(--text-secondary)]'>
            v{versionNumber}
          </span>
          {onVersionHistoryClick != null
            ? (
              <button
                type='button'
                onClick={onVersionHistoryClick}
                className='inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-[color:var(--bg-secondary)] text-[color:var(--accent-primary)] cursor-pointer border-none'
              >
                {priorVersions} prior {priorVersions === 1 ? 'version' : 'versions'}
              </button>
            )
            : (
              <span className='inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-[color:var(--bg-secondary)] text-[color:var(--text-secondary)]'>
                {priorVersions} prior {priorVersions === 1 ? 'version' : 'versions'}
              </span>
            )}
        </>
      )}
    </div>
  );
}
