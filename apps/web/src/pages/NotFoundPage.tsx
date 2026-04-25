import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-6xl font-bold" style={{ color: 'var(--accent-primary)' }}>404</h1>
      <p className="mt-4 text-lg" style={{ color: 'var(--text-secondary)' }}>
        Looks like this cup is empty. The page you're looking for doesn't exist.
      </p>
      <Link to="/" className="btn-primary mt-6">Go Home</Link>
    </div>
  );
}