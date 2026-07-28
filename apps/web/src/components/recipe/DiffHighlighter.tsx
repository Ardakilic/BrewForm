import { useTranslation } from '../../contexts/I18nContext.tsx';

interface DiffHighlighterProps {
  labelKey: string;
  value1: string | number | null;
  value2: string | number | null;
  formatter?: (val: string | number | null) => string;
}

export function DiffHighlighter({ labelKey, value1, value2, formatter }: DiffHighlighterProps) {
  const { t } = useTranslation();
  const display1 = formatter ? formatter(value1) : (value1 ?? '-');
  const display2 = formatter ? formatter(value2) : (value2 ?? '-');
  const differs = display1 !== display2;

  return (
    <div
      className='grid grid-cols-3 gap-2 py-2 text-sm'
      style={{
        borderBottom: '1px solid var(--border-primary)',
        backgroundColor: differs ? 'var(--diff-highlight, rgba(255, 200, 0, 0.1))' : 'transparent',
      }}
    >
      <div style={{ color: differs ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
        {display1}
      </div>
      <div className='text-center font-medium' style={{ color: 'var(--text-secondary)' }}>
        {t(labelKey)}
      </div>
      <div
        className='text-right'
        style={{ color: differs ? 'var(--accent-secondary)' : 'var(--text-primary)' }}
      >
        {display2}
      </div>
    </div>
  );
}
