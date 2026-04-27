import { Link } from 'react-router';

/**
 * Shown when a public-only QR scan resolves to a recipe that is no longer
 * accessible (deleted, made private, or moved back to draft).
 *
 * The detail page redirects here when the URL carries `?from=qr` AND the
 * recipe lookup fails or returns a non-public visibility.
 */
export function RecipeNotAvailablePage() {
  return (
    <div className='flex min-h-[60vh] flex-col items-center justify-center px-6 text-center'>
      <div className='text-8xl'>☕</div>
      <h1 className='mt-4 text-3xl font-bold' style={{ color: 'var(--text-primary)' }}>
        This recipe is no longer available
      </h1>
      <p className='mt-3 max-w-md text-base' style={{ color: 'var(--text-secondary)' }}>
        It may have been deleted, set to private, or returned to draft. The QR code you scanned was
        generated when the recipe was public.
      </p>
      <div className='mt-6 flex gap-3'>
        <Link to='/recipes' className='btn-primary'>Browse recipes</Link>
        <Link to='/' className='btn-secondary'>Go home</Link>
      </div>
    </div>
  );
}
