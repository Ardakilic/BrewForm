import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-6 py-12">
      <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Log In</h1>
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
        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            className="input-field"
            required
          />
        </div>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Logging in...' : 'Log In'}
        </button>
      </form>
      <p className="mt-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
        <Link to="/forgot-password" style={{ color: 'var(--accent-primary)' }}>Forgot password?</Link>
      </p>
      <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
        Don't have an account? <Link to="/register" style={{ color: 'var(--accent-primary)' }}>Sign up</Link>
      </p>
    </div>
  );
}