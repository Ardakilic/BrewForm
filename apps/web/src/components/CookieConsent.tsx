import { useEffect, useState } from 'react';
import { useTranslation } from '../contexts/I18nContext.tsx';

/**
 * Bottom-fixed cookie consent bar. Shown until the user accepts or
 * rejects; the choice persists in localStorage.
 */
export function CookieConsent() {
  const [show, setShow] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    const consent = localStorage.getItem('brewform_cookie_consent');
    if (!consent) setShow(true);
  }, []);

  function accept() {
    localStorage.setItem('brewform_cookie_consent', 'accepted');
    setShow(false);
  }

  function reject() {
    localStorage.setItem('brewform_cookie_consent', 'rejected');
    setShow(false);
  }

  if (!show) return null;

  return (
    <div
      className='fixed bottom-0 left-0 right-0 p-4'
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border-primary)',
        zIndex: 50,
      }}
    >
      <div className='mx-auto flex max-w-4xl items-center justify-between gap-4'>
        <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>
          {t('cookie.consent')}
        </p>
        <div className='flex gap-2'>
          <button type='button' onClick={reject} className='btn-secondary text-sm'>
            {t('cookie.reject')}
          </button>
          <button type='button' onClick={accept} className='btn-primary text-sm'>
            {t('cookie.accept')}
          </button>
        </div>
      </div>
    </div>
  );
}
