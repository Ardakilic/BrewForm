import { useState } from 'react';
import { useTranslation } from '../../contexts/I18nContext.tsx';

interface MergeField {
  key: string;
  labelKey: string;
  value1: string | number | null;
  value2: string | number | null;
}

interface MergeSelectorProps {
  fields: MergeField[];
  onMerge: (selections: Record<string, 'v1' | 'v2' | 'both' | 'none'>) => void;
}

export function MergeSelector({ fields, onMerge }: MergeSelectorProps) {
  const { t } = useTranslation();
  const [selections, setSelections] = useState<Record<string, string>>({});

  function handleSelect(field: string, value: string) {
    setSelections((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <div className='card space-y-3'>
      <h3 className='font-semibold' style={{ color: 'var(--text-primary)' }}>
        {t('merge.selectParams')}
      </h3>
      {fields.map((f) => (
        <div key={f.key} className='flex items-center gap-3 text-sm'>
          <span className='w-40' style={{ color: 'var(--text-secondary)' }}>
            {t(f.labelKey)}
          </span>
          <div className='flex gap-2 flex-1'>
            <label className='flex items-center gap-1 cursor-pointer'>
              <input
                type='radio'
                name={f.key}
                value='v1'
                checked={selections[f.key] === 'v1'}
                onChange={() => handleSelect(f.key, 'v1')}
              />
              <span style={{ color: 'var(--accent-primary)' }}>{f.value1 ?? '-'}</span>
            </label>
            <label className='flex items-center gap-1 cursor-pointer'>
              <input
                type='radio'
                name={f.key}
                value='v2'
                checked={selections[f.key] === 'v2'}
                onChange={() => handleSelect(f.key, 'v2')}
              />
              <span style={{ color: 'var(--accent-secondary)' }}>{f.value2 ?? '-'}</span>
            </label>
          </div>
        </div>
      ))}
      <button
        type='button'
        onClick={() => onMerge(selections as Record<string, 'v1' | 'v2' | 'both' | 'none'>)}
        className='btn-primary w-full'
      >
        {t('merge.create')}
      </button>
    </div>
  );
}
