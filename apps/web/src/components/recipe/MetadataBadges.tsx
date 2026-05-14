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
    <div className='flex flex-wrap items-center gap-2' style={{ color: 'var(--text-secondary)' }}>
      {/* Author badge */}
      {author != null && (
        <Link
          to={`/u/${author.username}`}
          className='inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium'
          style={{
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-secondary)',
          }}
        >
          {author.displayName ?? author.username}
        </Link>
      )}

      {author != null && (
        <span className='text-xs' style={{ color: 'var(--text-tertiary)' }}>
          •
        </span>
      )}

      {/* Visibility badge — draft gets a dashed border */}
      <span
        className='inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium'
        style={{
          backgroundColor: 'var(--bg-secondary)',
          color: 'var(--text-secondary)',
          border: isDraft ? '1px dashed var(--border-primary)' : undefined,
        }}
      >
        <span
          className='inline-block rounded-full'
          style={{ width: '8px', height: '8px', backgroundColor: dotColor, flexShrink: 0 }}
          aria-hidden='true'
        />
        {visibility.charAt(0).toUpperCase() + visibility.slice(1)}
      </span>

      {/* Brew method badge */}
      {brewMethod != null && (
        <>
          <span className='text-xs' style={{ color: 'var(--text-tertiary)' }}>
            •
          </span>
          <span
            className='inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium'
            style={{
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-secondary)',
            }}
          >
            {toTitleCase(brewMethod)}
          </span>
        </>
      )}

      {/* Version info — only shown when there are multiple versions */}
      {versionCount > 1 && (
        <>
          <span className='text-xs' style={{ color: 'var(--text-tertiary)' }}>
            •
          </span>
          <span
            className='inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium'
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-secondary)',
            }}
          >
            v{versionNumber}
          </span>
          {onVersionHistoryClick != null
            ? (
              <button
                type='button'
                onClick={onVersionHistoryClick}
                className='inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium'
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--accent-primary)',
                  cursor: 'pointer',
                  border: 'none',
                }}
              >
                {priorVersions} prior {priorVersions === 1 ? 'version' : 'versions'}
              </button>
            )
            : (
              <span
                className='inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium'
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-secondary)',
                }}
              >
                {priorVersions} prior {priorVersions === 1 ? 'version' : 'versions'}
              </span>
            )}
        </>
      )}
    </div>
  );
}
