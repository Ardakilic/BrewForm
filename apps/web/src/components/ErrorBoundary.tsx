import { isRouteErrorResponse, Link, useRouteError } from 'react-router';

export function RootErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return (
      <div
        className='flex min-h-screen flex-col items-center justify-center px-6 text-center'
        style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
      >
        <h1 className='text-6xl font-bold' style={{ color: 'var(--accent-primary)' }}>
          {error.status}
        </h1>
        <p className='mt-4 text-lg' style={{ color: 'var(--text-secondary)' }}>
          {error.status === 404
            ? "Looks like this cup is empty. The page you're looking for doesn't exist."
            : error.statusText || 'Something went wrong.'}
        </p>
        <div className='mt-6 flex gap-4'>
          <Link to='/' className='btn-primary'>
            Go Home
          </Link>
          <button
            type='button'
            className='btn-primary'
            onClick={() => globalThis.location.reload()}
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  const message = error instanceof Error ? error.message : 'An unexpected error occurred.';

  return (
    <div
      className='flex min-h-screen flex-col items-center justify-center px-6 text-center'
      style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
    >
      <h1 className='text-6xl font-bold' style={{ color: 'var(--accent-primary)' }}>
        Oops
      </h1>
      <p className='mt-4 text-lg' style={{ color: 'var(--text-secondary)' }}>
        {message}
      </p>
      {import.meta.env.DEV && error instanceof Error && error.stack && (
        <pre
          className='mt-4 max-w-2xl overflow-auto rounded-lg p-4 text-left text-xs'
          style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
        >
          {error.stack}
        </pre>
      )}
      <div className='mt-6 flex gap-4'>
        <Link to='/' className='btn-primary'>
          Go Home
        </Link>
        <button
          type='button'
          className='btn-primary'
          onClick={() => globalThis.location.reload()}
        >
          Reload Page
        </button>
      </div>
    </div>
  );
}
