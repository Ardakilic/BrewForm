import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import { useTranslation } from '../../contexts/I18nContext.tsx';

type ToastType = 'success' | 'error';

interface ToastItem {
  id: number;
  type: ToastType;
  i18nKey: string;
}

type ToastAction =
  | { type: 'ADD'; toast: ToastItem }
  | { type: 'REMOVE'; id: number };

function toastReducer(state: ToastItem[], action: ToastAction): ToastItem[] {
  switch (action.type) {
    case 'ADD':
      return [...state, action.toast];
    case 'REMOVE':
      return state.filter((t) => t.id !== action.id);
  }
}

interface ToastContextValue {
  success: (i18nKey: string) => void;
  error: (i18nKey: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 4000;

/**
 * Provides a toast queue via React context. Renders a fixed bottom-right
 * container with `role='status'` and `aria-live='polite'`. Toasts auto-dismiss
 * after {@link AUTO_DISMISS_MS} and are themed via CSS custom properties.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, dispatch] = useReducer(toastReducer, []);
  const idRef = useRef(0);
  const { t } = useTranslation();

  const addToast = useCallback((type: ToastType, i18nKey: string) => {
    const id = ++idRef.current;
    dispatch({ type: 'ADD', toast: { id, type, i18nKey } });
    setTimeout(() => dispatch({ type: 'REMOVE', id }), AUTO_DISMISS_MS);
  }, []);

  const value = useMemo<ToastContextValue>(() => ({
    success: (key: string) => addToast('success', key),
    error: (key: string) => addToast('error', key),
  }), [addToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className='fixed bottom-4 right-4 z-[100] flex flex-col gap-2'
        role='status'
        aria-live='polite'
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className='card flex items-center gap-2 px-4 py-3 shadow-lg animate-fade-in'
            style={{
              borderLeft: `4px solid var(--${toast.type === 'success' ? 'success' : 'error'})`,
              minWidth: '16rem',
              maxWidth: '24rem',
            }}
          >
            <span
              aria-hidden='true'
              style={{ color: `var(--${toast.type === 'success' ? 'success' : 'error'})` }}
            >
              {toast.type === 'success' ? '✓' : '✕'}
            </span>
            <span className='text-sm' style={{ color: 'var(--text-primary)' }}>
              {t(toast.i18nKey)}
            </span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Accesses the toast context; throws outside {@link ToastProvider}. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
