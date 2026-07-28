import { useTranslation } from '../../contexts/I18nContext.tsx';

/** Props for {@link DiffHighlighter}. */
interface DiffHighlighterProps {
  labelKey: string;
  value1: string | number | null;
  value2: string | number | null;
  formatter?: (val: string | number | null) => string;
  status?: 'added' | 'removed' | 'modified' | 'unchanged';
}

const statusStyles: Record<
  NonNullable<DiffHighlighterProps['status']>,
  { bg: string; text: string }
> = {
  added: { bg: 'var(--diff-added-bg)', text: 'var(--diff-added-text)' },
  removed: { bg: 'var(--diff-removed-bg)', text: 'var(--diff-removed-text)' },
  modified: { bg: 'var(--diff-modified-bg)', text: 'var(--diff-modified-text)' },
  unchanged: { bg: 'transparent', text: 'var(--text-primary)' },
};

/**
 * Renders a side-by-side diff row with a centered label.
 * When `status` is provided it drives colors; otherwise falls back to binary differ detection.
 */
export function DiffHighlighter({
  labelKey,
  value1,
  value2,
  formatter,
  status,
}: DiffHighlighterProps) {
  const { t } = useTranslation();
  const display1 = formatter ? formatter(value1) : (value1 ?? '-');
  const display2 = formatter ? formatter(value2) : (value2 ?? '-');
  const differs = display1 !== display2;

  const s = status ? statusStyles[status] : undefined;
  const bgColor = s
    ? s.bg
    : differs
    ? 'var(--diff-highlight, rgba(255, 200, 0, 0.1))'
    : 'transparent';
  const leftColor = s ? s.text : differs ? 'var(--accent-primary)' : 'var(--text-primary)';
  const rightColor = s ? s.text : differs ? 'var(--accent-secondary)' : 'var(--text-primary)';

  return (
    <div
      className='grid grid-cols-3 gap-2 py-2 text-sm'
      style={{
        borderBottom: '1px solid var(--border-primary)',
        backgroundColor: bgColor,
      }}
    >
      <div style={{ color: leftColor }}>
        {display1}
      </div>
      <div className='text-center font-medium' style={{ color: 'var(--text-secondary)' }}>
        {t(labelKey)}
      </div>
      <div
        className='text-right'
        style={{ color: rightColor }}
      >
        {display2}
      </div>
    </div>
  );
}
