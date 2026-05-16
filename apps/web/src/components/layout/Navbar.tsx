import { Link, NavLink } from 'react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Select } from '@base-ui/react/select';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useTranslation } from '../../contexts/I18nContext';
import { authApi } from '../../api/index';

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// --- NavItem helper ---

interface NavItemProps {
  to: string;
  label: string;
  end?: boolean;
  onClick?: () => void;
}

function NavItem({ to, label, end = false, onClick }: NavItemProps) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        isActive
          ? 'rounded-full border border-[color:var(--accent-primary)] px-3 py-1.5 text-sm font-medium text-[color:var(--accent-primary)] transition-colors duration-150 motion-reduce:duration-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent-primary)]'
          : 'rounded-full px-3 py-1.5 text-sm text-[color:var(--text-secondary)] transition-colors duration-150 motion-reduce:duration-0 hover:bg-[color:var(--bg-tertiary)] hover:text-[color:var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent-primary)]'}
    >
      {label}
    </NavLink>
  );
}

// --- ThemeSwitcher helper ---
// Standalone: receives theme, setTheme, and t as props so it can be used
// in both the desktop nav and the mobile menu without hook coupling.

type Theme = 'light' | 'dark' | 'coffee';

interface ThemeSwitcherProps {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  t: (key: string) => string;
}

function ThemeSwitcher({ theme, setTheme, t }: ThemeSwitcherProps) {
  const themes: { value: Theme; labelKey: string }[] = [
    { value: 'light', labelKey: 'theme.light' },
    { value: 'dark', labelKey: 'theme.dark' },
    { value: 'coffee', labelKey: 'theme.coffee' },
  ];

  const itemToStringLabel = useCallback(
    (val: string) => t(`theme.${val}`) || val,
    [t],
  );

  return (
    <Select.Root
      value={theme}
      onValueChange={(val) => setTheme(val as Theme)}
      itemToStringLabel={itemToStringLabel}
    >
      {/* Trigger: pill-shaped button showing current theme name with a chevron */}
      <Select.Trigger
        className={[
          'flex items-center gap-1.5 rounded-full px-3 py-1',
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
        <Select.Value />
        <Select.Icon className='flex items-center text-[color:var(--text-secondary)]'>
          {/* Chevron down — inline SVG, no icon library needed */}
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
            {themes.map(({ value, labelKey }) => (
              <Select.Item
                key={value}
                value={value}
                className={[
                  'grid grid-cols-[1rem_1fr] items-center gap-2 px-3 py-2',
                  'text-sm text-[color:var(--text-primary)] cursor-default',
                  'outline-none select-none rounded-md mx-1',
                  'data-[highlighted]:bg-[color:var(--bg-secondary)] data-[highlighted]:text-[color:var(--text-primary)]',
                  'transition-colors duration-150 ease-in-out motion-reduce:duration-0',
                ].join(' ')}
              >
                {/* Checkmark — inline SVG, visible only when item is selected */}
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
                <Select.ItemText className='col-start-2'>{t(labelKey)}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

// --- NAV_ITEMS config ---

interface NavItemConfig {
  to: string;
  labelKey: string;
  end: boolean;
  authRequired: boolean;
}

const NAV_ITEMS = [
  { to: '/recipes', labelKey: 'nav.recipes', end: true, authRequired: false },
  { to: '/recipes/new', labelKey: 'recipe.create', end: true, authRequired: true },
  { to: '/recipes/starred', labelKey: 'recipe.starred.title', end: true, authRequired: true },
  { to: '/setups', labelKey: 'setup.title', end: false, authRequired: true },
  // Profile is dynamic: /u/${user.username} — handled separately
] as const satisfies readonly NavItemConfig[];

// --- Navbar ---

export function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);

  useEffect(() => {
    if (user) return;
    authApi.registrationStatus()
      .then(({ enabled }) => setRegistrationEnabled(enabled))
      .catch(() => setRegistrationEnabled(true));
  }, [user]);

  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // On open: move focus to the first focusable element in the panel (close button)
  useEffect(() => {
    if (isMenuOpen && panelRef.current) {
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      focusable[0]?.focus();
    }
  }, [isMenuOpen]);

  // On close: return focus to the hamburger button
  useEffect(() => {
    if (!isMenuOpen) {
      hamburgerRef.current?.focus();
    }
  }, [isMenuOpen]);

  // Focus trap: Tab/Shift+Tab cycle within the panel; Escape closes the menu
  const handlePanelKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        setIsMenuOpen(false);
        return;
      }

      if (e.key === 'Tab' && panelRef.current) {
        const focusable = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        ).filter((el) => !el.closest('[data-hidden]'));

        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          // Shift+Tab: if focus is on first element, wrap to last
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          // Tab: if focus is on last element, wrap to first
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    },
    [],
  );

  return (
    <header className='bg-[color:var(--bg-secondary)] border-b border-[color:var(--border-primary)]'>
      <div className='mx-auto flex max-w-6xl items-center justify-between px-6 py-3'>
        {/* Brand / Logo */}
        <Link
          to='/'
          className='rounded-sm text-xl font-bold text-[color:var(--accent-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent-primary)]'
        >
          ☕ {t('app.name')}
        </Link>

        {/* Desktop nav — hidden on mobile, visible md+ */}
        <nav aria-label={t('nav.main')} className='hidden md:flex items-center gap-4'>
          <ul className='flex items-center gap-4 list-none m-0 p-0'>
            {NAV_ITEMS.filter(
              (item) => !item.authRequired || isAuthenticated,
            ).map((item) => (
              <li key={item.to}>
                <NavItem to={item.to} label={t(item.labelKey)} end={item.end} />
              </li>
            ))}

            {/* Profile link — dynamic path, only when authenticated */}
            {isAuthenticated && user?.username && (
              <li>
                <NavItem
                  to={`/u/${user.username}`}
                  label={t('nav.profile')}
                  end={false}
                />
              </li>
            )}
          </ul>

          {/* Theme switcher — Base UI Select, styled with CSS custom properties */}
          <ThemeSwitcher theme={theme} setTheme={setTheme} t={t} />

          {/* Auth actions */}
          {isAuthenticated
            ? (
              <button
                type='button'
                onClick={logout}
                className='btn-secondary text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent-primary)]'
              >
                {t('nav.logout')}
              </button>
            )
            : (
              <>
                <Link
                  to='/login'
                  className='rounded-sm text-sm text-[color:var(--text-secondary)] transition-colors duration-150 motion-reduce:duration-0 hover:text-[color:var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent-primary)]'
                >
                  {t('nav.login')}
                </Link>
                {registrationEnabled && (
                  <Link
                    to='/register'
                    className='btn-primary text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent-primary)]'
                  >
                    {t('nav.register')}
                  </Link>
                )}
              </>
            )}
        </nav>

        {/* Mobile hamburger button */}
        <button
          ref={hamburgerRef}
          type='button'
          aria-expanded={isMenuOpen}
          aria-controls='mobile-menu'
          aria-label={t('nav.menuToggle')}
          onClick={() => setIsMenuOpen((prev) => !prev)}
          className='flex md:hidden min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-[color:var(--text-secondary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent-primary)]'
        >
          <span className='sr-only'>{t('nav.menuToggle')}</span>
          {/* Hamburger / X icon */}
          <svg
            xmlns='http://www.w3.org/2000/svg'
            width='24'
            height='24'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='2'
            strokeLinecap='round'
            strokeLinejoin='round'
            aria-hidden='true'
          >
            {isMenuOpen
              ? (
                <>
                  <line x1='18' y1='6' x2='6' y2='18' />
                  <line x1='6' y1='6' x2='18' y2='18' />
                </>
              )
              : (
                <>
                  <line x1='3' y1='6' x2='21' y2='6' />
                  <line x1='3' y1='12' x2='21' y2='12' />
                  <line x1='3' y1='18' x2='21' y2='18' />
                </>
              )}
          </svg>
        </button>
      </div>

      {/* Mobile menu drawer */}
      {isMenuOpen && (
        <div className='md:hidden'>
          {/* Backdrop overlay — semi-transparent, closes menu on click */}
          <div
            aria-hidden='true'
            onClick={() => setIsMenuOpen(false)}
            className='fixed inset-0 z-40 bg-black/40 animate-fade-in motion-reduce:animate-none'
          />

          {/* Slide-in panel from the right */}
          <div
            ref={panelRef}
            id='mobile-menu'
            role='dialog'
            aria-modal='true'
            aria-label={t('nav.menu')}
            onKeyDown={handlePanelKeyDown}
            className={[
              'fixed inset-y-0 right-0 z-50 flex w-72 max-w-full flex-col',
              'bg-[color:var(--bg-secondary)] border-l border-[color:var(--border-primary)]',
              'shadow-xl',
              // Slide-in animation from right
              'animate-slide-in-right motion-reduce:animate-none',
            ].join(' ')}
          >
            {/* Panel header: close button */}
            <div className='flex items-center justify-between border-b border-[color:var(--border-primary)] px-4 py-3'>
              <span className='text-sm font-medium text-[color:var(--text-primary)]'>
                {t('nav.menu')}
              </span>
              <button
                type='button'
                aria-label={t('nav.close')}
                onClick={() => setIsMenuOpen(false)}
                className='flex min-h-[44px] min-w-[44px] items-center justify-center text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors duration-150 motion-reduce:duration-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[color:var(--accent-primary)]'
              >
                <svg
                  xmlns='http://www.w3.org/2000/svg'
                  width='20'
                  height='20'
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth='2'
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  aria-hidden='true'
                >
                  <line x1='18' y1='6' x2='6' y2='18' />
                  <line x1='6' y1='6' x2='18' y2='18' />
                </svg>
              </button>
            </div>

            {/* Nav items */}
            <nav aria-label={t('nav.main')} className='flex-1 overflow-y-auto px-3 py-4'>
              <ul className='flex flex-col gap-0.5 list-none m-0 p-0'>
                {NAV_ITEMS.filter(
                  (item) => !item.authRequired || isAuthenticated,
                ).map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      onClick={() => setIsMenuOpen(false)}
                      className={({ isActive }) =>
                        isActive
                          ? 'flex items-center rounded-full border border-[color:var(--accent-primary)] px-4 py-3 text-base font-medium text-[color:var(--accent-primary)] transition-colors duration-150 motion-reduce:duration-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent-primary)]'
                          : 'flex items-center rounded-full px-4 py-3 text-base text-[color:var(--text-secondary)] transition-colors duration-150 motion-reduce:duration-0 hover:bg-[color:var(--bg-tertiary)] hover:text-[color:var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent-primary)]'}
                    >
                      {t(item.labelKey)}
                    </NavLink>
                  </li>
                ))}

                {/* Profile link — dynamic path, only when authenticated */}
                {isAuthenticated && user?.username && (
                  <li>
                    <NavLink
                      to={`/u/${user.username}`}
                      end={false}
                      onClick={() => setIsMenuOpen(false)}
                      className={({ isActive }) =>
                        isActive
                          ? 'flex items-center rounded-full border border-[color:var(--accent-primary)] px-4 py-3 text-base font-medium text-[color:var(--accent-primary)] transition-colors duration-150 motion-reduce:duration-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent-primary)]'
                          : 'flex items-center rounded-full px-4 py-3 text-base text-[color:var(--text-secondary)] transition-colors duration-150 motion-reduce:duration-0 hover:bg-[color:var(--bg-tertiary)] hover:text-[color:var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent-primary)]'}
                    >
                      {t('nav.profile')}
                    </NavLink>
                  </li>
                )}
              </ul>
            </nav>

            {/* Footer: ThemeSwitcher + auth actions */}
            <div className='border-t border-[color:var(--border-primary)] px-4 py-4 flex flex-col gap-3'>
              <ThemeSwitcher theme={theme} setTheme={setTheme} t={t} />

              {isAuthenticated
                ? (
                  <button
                    type='button'
                    onClick={() => {
                      logout();
                      setIsMenuOpen(false);
                    }}
                    className='btn-secondary text-sm w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent-primary)]'
                  >
                    {t('nav.logout')}
                  </button>
                )
                : (
                  <div className='flex flex-col gap-2'>
                    <Link
                      to='/login'
                      onClick={() => setIsMenuOpen(false)}
                      className='rounded-sm text-sm text-center text-[color:var(--text-secondary)] transition-colors duration-150 motion-reduce:duration-0 hover:text-[color:var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent-primary)]'
                    >
                      {t('nav.login')}
                    </Link>
                    {registrationEnabled && (
                      <Link
                        to='/register'
                        onClick={() => setIsMenuOpen(false)}
                        className='btn-primary text-sm text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent-primary)]'
                      >
                        {t('nav.register')}
                      </Link>
                    )}
                  </div>
                )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
