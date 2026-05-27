import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext.tsx';
import { authApi } from '../api/index.ts';

export function EmailVerificationBanner() {
  const { user } = useAuth();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (!user || user.emailVerifiedAt) return null;

  const handleResend = async () => {
    setSending(true);
    try {
      await authApi.sendVerification();
      setSent(true);
    } catch {
      // Silently fail -- user can try again
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className='flex items-center justify-center gap-2 px-4 py-2 text-sm'
      style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
    >
      <span>Please verify your email address to unlock all features.</span>
      <button
        type='button'
        onClick={handleResend}
        disabled={sending || sent}
        className='underline font-medium'
      >
        {sent ? 'Email sent!' : sending ? 'Sending...' : 'Resend verification email'}
      </button>
    </div>
  );
}
