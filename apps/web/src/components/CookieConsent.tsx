import { useState, useEffect } from 'react';

export function CookieConsent() {
  const [show, setShow] = useState(false);

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
    <div className="fixed bottom-0 left-0 right-0 p-4" style={{ backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border-primary)', zIndex: 50 }}>
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          We use cookies to improve your experience. You can accept or reject non-essential cookies.
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={reject} className="btn-secondary text-sm">Reject</button>
          <button type="button" onClick={accept} className="btn-primary text-sm">Accept</button>
        </div>
      </div>
    </div>
  );
}