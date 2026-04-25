import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { authApi } from '../../api/index';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!token) {
      setError('Invalid or missing reset token. Please use the link from your email.');
      return;
    }

    setLoading(true);
    try {
      await authApi.resetPassword({ token, newPassword });
      setSuccess(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to reset password';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="mx-auto max-w-md px-6 py-12">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Password Reset</h1>
        <p className="mt-4" style={{ color: 'var(--text-secondary)' }}>
          Your password has been reset successfully. You can now log in with your new password.
        </p>
        <Link to="/login" className="btn-primary mt-6 inline-block">Log In</Link>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-md px-6 py-12">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Invalid Link</h1>
        <p className="mt-4" style={{ color: 'var(--text-secondary)' }}>
          This password reset link is invalid. Please request a new one.
        </p>
        <Link to="/forgot-password" className="btn-primary mt-6 inline-block">Request New Link</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-6 py-12">
      <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Reset Password</h1>
      {error && (
        <div className="mt-4 rounded p-3 text-sm" style={{ backgroundColor: 'var(--error)', color: 'white' }}>
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            New Password
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="At least 8 characters"
            className="input-field"
            required
            minLength={8}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            Confirm New Password
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter your new password"
            className="input-field"
            required
          />
        </div>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Resetting...' : 'Reset Password'}
        </button>
      </form>
    </div>
  );
}