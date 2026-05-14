import { Select } from '@base-ui-components/react/select';

interface LanguageSelectorProps {
  locale: string;
  setLocale: (locale: 'en' | 'tr') => void;
  availableLocales: string[];
}

const LOCALE_LABELS: Record<string, string> = {
  en: '🇬🇧 English',
  tr: '🇹🇷 Türkçe',
};

export function LanguageSelector({ locale, setLocale, availableLocales }: LanguageSelectorProps) {
  if (!availableLocales || availableLocales.length === 0) {
    return null;
  }

  const activeLabel = LOCALE_LABELS[locale] ?? locale;

  return (
    <Select.Root
      id='language-switcher'
      value={locale}
      onValueChange={(val) => setLocale(val as 'en' | 'tr')}
    >
      <Select.Trigger
        className={[
          'flex items-center gap-1.5 rounded-full px-3 py-1 min-h-11',
          'border border-[color:var(--border-primary)]',
          'bg-[color:var(--bg-tertiary)] text-[color:var(--text-primary)]',
          'text-sm cursor-default select-none',
          'transition-colors duration-300 ease-in-out motion-reduce:duration-0',
          'hover:border-[color:var(--border-secondary)]',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1',
          'focus-visible:outline-[color:var(--accent-primary)]',
          'data-[popup-open]:border-[color:var(--accent-primary)]',
        ].join(' ')}
      >
        <Select.Value>{activeLabel}</Select.Value>
        <Select.Icon className='flex items-center text-[color:var(--text-secondary)]'>
          <svg
            width='10'
            height='6'
            viewBox='0 0 10 6'
            fill='none'
            stroke='currentColor'
            strokeWidth='1.5'
            strokeLinecap='round'
            strokeLinejoin='round'
            aria-hidden='true'
          >
            <path d='M1 1l4 4 4-4' />
          </svg>
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Positioner sideOffset={8} className='z-50 outline-none select-none'>
          <Select.Popup
            className={[
              'min-w-[var(--anchor-width)] rounded-lg py-1',
              'bg-[color:var(--bg-tertiary)]',
              'border border-[color:var(--border-primary)]',
              'shadow-lg',
              'origin-[var(--transform-origin)]',
              'transition-[transform,scale,opacity] duration-150 ease-out motion-reduce:duration-0',
              'data-[starting-style]:scale-95 data-[starting-style]:opacity-0',
              'data-[ending-style]:scale-95 data-[ending-style]:opacity-0',
            ].join(' ')}
          >
            {availableLocales.map((loc) => (
              <Select.Item
                key={loc}
                value={loc}
                className={[
                  'grid grid-cols-[1rem_1fr] items-center gap-2 px-3 py-2 min-h-11',
                  'text-sm text-[color:var(--text-primary)] cursor-default',
                  'outline-none select-none rounded-md mx-1',
                  'data-[highlighted]:bg-[color:var(--bg-secondary)] data-[highlighted]:text-[color:var(--text-primary)]',
                  'transition-colors duration-150 ease-in-out motion-reduce:duration-0',
                ].join(' ')}
              >
                <Select.ItemIndicator className='col-start-1 flex items-center justify-center text-[color:var(--accent-primary)]'>
                  <svg
                    width='12'
                    height='12'
                    viewBox='0 0 12 12'
                    fill='none'
                    stroke='currentColor'
                    strokeWidth='2'
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    aria-hidden='true'
                  >
                    <path d='M2 6l3 3 5-5' />
                  </svg>
                </Select.ItemIndicator>
                <Select.ItemText className='col-start-2'>
                  {LOCALE_LABELS[loc] ?? loc}
                </Select.ItemText>
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
