import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from '../../contexts/I18nContext.tsx';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  ariaLabel?: string;
  panelClassName?: string;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Overlay shell: `fixed inset-0 z-50` backdrop + `.card` panel with Escape
 * close, backdrop-click close, and a keyboard focus trap.
 */
export function Modal({ open, onClose, children, ariaLabel, panelClassName }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    if (panel) {
      const first = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      first?.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const p = panelRef.current;
      if (!p) return;
      const focusable = Array.from(p.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center'
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className={`card w-full mx-4 ${panelClassName ?? 'max-w-md'}`}
        role='dialog'
        aria-modal='true'
        aria-label={ariaLabel}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export interface ConfirmOptions {
  titleKey: string;
  bodyKey: string;
  danger?: boolean;
  confirmLabelKey?: string;
}

interface ConfirmContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

/**
 * Mounts a single {@link Modal}-based confirm dialog. `useConfirm()` returns a
 * `confirm(opts)` function that resolves `true` on confirm, `false` on
 * cancel / Escape / backdrop click.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((v: boolean) => void) | null>(null);
  const { t } = useTranslation();

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setOptions(opts);
    });
  }, []);

  const handleClose = useCallback((result: boolean) => {
    setOptions(null);
    resolveRef.current?.(result);
    resolveRef.current = null;
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <Modal
        open={options !== null}
        onClose={() => handleClose(false)}
        ariaLabel={options ? t(options.titleKey) : undefined}
        panelClassName='max-w-sm'
      >
        {options && (
          <>
            <h3 className='font-semibold mb-2' style={{ color: 'var(--text-primary)' }}>
              {t(options.titleKey)}
            </h3>
            <p className='text-sm mb-4' style={{ color: 'var(--text-secondary)' }}>
              {t(options.bodyKey)}
            </p>
            <div className='flex justify-end gap-2'>
              <button type='button' onClick={() => handleClose(false)} className='btn-secondary'>
                {t('common.cancel')}
              </button>
              <button
                type='button'
                onClick={() => handleClose(true)}
                className='btn-primary'
                style={options.danger ? { background: 'var(--error)' } : undefined}
              >
                {t(options.confirmLabelKey ?? 'common.delete')}
              </button>
            </div>
          </>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}

/** Accesses the confirm context; falls back to native confirm outside {@link ConfirmProvider}. */
export function useConfirm(): ConfirmContextValue {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    return {
      // Native confirm is the documented fallback when used outside a ConfirmProvider (e.g. unit tests).
      // deno-lint-ignore no-window
      confirm: (opts: ConfirmOptions) => Promise.resolve(window.confirm(opts.bodyKey)),
    };
  }
  return ctx;
}
