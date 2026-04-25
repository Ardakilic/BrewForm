import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { authApi } from '../../api/index';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authApi.forgotPassword({ email });
      setSuccess(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send reset email';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="mx-auto max-w-md px-6 py-12">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Check Your Email</h1>
        <p className="mt-4" style={{ color: 'var(--text-secondary)' }}>
          If an account with that email exists, we've sent you a password reset link.
        </p>
        <Link to="/login" className="btn-secondary mt-6 inline-block">Back to Login</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-6 py-12">
      <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Forgot Password</h1>
      <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
        Enter your email and we'll send you a reset link.
      </p>
      {error && (
        <div className="mt-4 rounded p-3 text-sm" style={{ backgroundColor: 'var(--error)', color: 'white' }}>
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="input-field"
            required
          />
        </div>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Sending...' : 'Send Reset Link'}
        </button>
      </form>
      <p className="mt-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
        Remember your password? <Link to="/login" style={{ color: 'var(--accent-primary)' }}>Log in</Link>
      </p>
    </div>
  );
}