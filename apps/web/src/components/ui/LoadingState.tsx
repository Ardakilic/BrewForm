import { useTranslation } from '../../contexts/I18nContext.tsx';

/** Props accepted by {@link LoadingState}. */
interface LoadingStateProps {
  /** Override the default `t('common.loading')` message. */
  message?: string;
  /** Extra classes appended to the wrapper (e.g. page-container constraints). */
  className?: string;
}

/**
 * Standard centered loading indicator: `text-center py-12` with secondary text
 * and the shared `common.loading` label (overridable via `message`).
 */
export function LoadingState({ message, className = '' }: LoadingStateProps) {
  const { t } = useTranslation();
  return (
    <div
      className={`text-center py-12 ${className}`.trim()}
      style={{ color: 'var(--text-secondary)' }}
    >
      {message ?? t('common.loading')}
    </div>
  );
}
