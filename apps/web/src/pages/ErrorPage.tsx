import { Link } from 'react-router';

interface Props {
  statusCode: number;
  message: string;
  illustration: string;
}

export function ErrorPage({ statusCode, message, illustration }: Props) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="text-8xl">{illustration}</div>
      <h1 className="mt-4 text-4xl font-bold" style={{ color: 'var(--text-primary)' }}>{statusCode}</h1>
      <p className="mt-2 text-lg" style={{ color: 'var(--text-secondary)' }}>{message}</p>
      <Link to="/" className="btn-primary mt-6">Go Home</Link>
    </div>
  );
}

export function NotFoundPage() {
  return <ErrorPage statusCode={404} message="Looks like this cup is empty. The page you're looking for doesn't exist." illustration="\uD83E\uDEE5" />;
}

export function ServerErrorPage() {
  return <ErrorPage statusCode={500} message="Something went wrong. We're brewing a fix." illustration="\uD83D\uDC94" />;
}

export function ForbiddenPage() {
  return <ErrorPage statusCode={403} message="You don't have permission to access this page." illustration="\uD83D\uDD12" />;
}