import type { CSSProperties } from 'react';

// ---------------------------------------------------------------------------
// Base Skeleton
// ---------------------------------------------------------------------------

interface SkeletonProps {
  className?: string;
  width?: string;
  height?: string;
  circle?: boolean;
  style?: CSSProperties;
}

/** Base pulsing placeholder block; sizing and shape via props. */
export function Skeleton({ className = '', width, height, circle, style }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse ${circle ? 'rounded-full' : 'rounded'} ${className}`}
      style={{
        backgroundColor: 'var(--bg-tertiary)',
        width,
        height,
        ...style,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// SkeletonText -- renders N lines of varying width
// ---------------------------------------------------------------------------

interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

/** N stacked text-line skeletons with a shortened last line. */
export function SkeletonText({ lines = 3, className = '' }: SkeletonTextProps) {
  const widths = ['65%', '75%', '70%', '80%', '60%', '85%'];
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          height='0.75rem'
          width={i === lines - 1 ? widths[Math.min(i, widths.length - 1)] : '100%'}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RecipeCardSkeleton
// ---------------------------------------------------------------------------

/** Placeholder matching a recipe card's title, author, and badge rows. */
export function RecipeCardSkeleton() {
  return (
    <div className='card space-y-3'>
      <Skeleton height='1.25rem' width='70%' />
      <Skeleton height='0.875rem' width='40%' />
      <div className='flex gap-2'>
        <Skeleton height='0.75rem' width='4rem' />
        <Skeleton height='0.75rem' width='4rem' />
        <Skeleton height='0.75rem' width='3rem' />
      </div>
      <div className='flex gap-3'>
        <Skeleton height='0.75rem' width='2rem' />
        <Skeleton height='0.75rem' width='2rem' />
        <Skeleton height='0.75rem' width='2rem' />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CatalogCardSkeleton -- placeholder for catalog (variety/equipment) cards
// ---------------------------------------------------------------------------

/** Placeholder matching a catalog card's title row, type pill, and body lines. */
export function CatalogCardSkeleton() {
  return (
    <div className='card space-y-3'>
      <div className='flex gap-2'>
        <Skeleton height='1.25rem' width='60%' />
        <Skeleton height='1.25rem' width='4rem' className='rounded-full' />
      </div>
      <Skeleton height='0.875rem' width='40%' />
      <Skeleton height='0.875rem' width='80%' />
      <Skeleton height='2.5rem' />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CardSkeletonGrid -- responsive grid of N card skeletons (recipe or catalog)
// ---------------------------------------------------------------------------

interface CardSkeletonGridProps {
  count?: number;
  variant?: 'recipe' | 'catalog';
}

/**
 * Responsive grid of `count` card skeletons. `variant` selects the card shape
 * and grid columns: `recipe` (default) mirrors recipe cards, `catalog` mirrors
 * the variety/equipment catalog cards.
 */
export function CardSkeletonGrid({ count = 6, variant = 'recipe' }: CardSkeletonGridProps) {
  const gridClass = variant === 'catalog'
    ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
    : 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3';
  return (
    <div className={gridClass}>
      {Array.from({ length: count }, (_, i) =>
        variant === 'catalog' ? <CatalogCardSkeleton key={i} /> : <RecipeCardSkeleton key={i} />)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RecipeCardSkeletonGrid -- grid of N recipe card skeletons
// ---------------------------------------------------------------------------

interface RecipeCardSkeletonGridProps {
  count?: number;
}

/** Responsive grid of `count` recipe-card skeletons. */
export function RecipeCardSkeletonGrid({ count = 6 }: RecipeCardSkeletonGridProps) {
  return <CardSkeletonGrid count={count} variant='recipe' />;
}

// ---------------------------------------------------------------------------
// RecipeDetailSkeleton -- mirrors RecipeDetailPage layout
// ---------------------------------------------------------------------------

/** Full-page placeholder mirroring the recipe detail layout. */
export function RecipeDetailSkeleton() {
  return (
    <div className='mx-auto max-w-4xl px-6 py-8 space-y-6'>
      <Skeleton height='0.875rem' width='12rem' />

      <div className='space-y-3'>
        <Skeleton height='2rem' width='60%' />
        <div className='flex gap-2'>
          <Skeleton height='1.5rem' width='5rem' className='rounded-full' />
          <Skeleton height='1.5rem' width='5rem' className='rounded-full' />
        </div>
      </div>

      <div className='grid grid-cols-2 gap-4 sm:grid-cols-4'>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className='card space-y-2'>
            <Skeleton height='0.75rem' width='3rem' />
            <Skeleton height='1.5rem' width='4rem' />
          </div>
        ))}
      </div>

      <div className='card space-y-3'>
        <Skeleton height='1.25rem' width='8rem' />
        <div className='space-y-2'>
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} height='2.5rem' />)}
        </div>
      </div>

      <div className='card space-y-3'>
        <Skeleton height='1.25rem' width='6rem' />
        <SkeletonText lines={3} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CommentSkeleton -- single comment placeholder
// ---------------------------------------------------------------------------

/** Placeholder for a single comment (avatar plus text lines). */
export function CommentSkeleton() {
  return (
    <div className='flex gap-3 py-3'>
      <Skeleton circle width='2.5rem' height='2.5rem' />
      <div className='flex-1 space-y-2'>
        <div className='flex items-center gap-2'>
          <Skeleton height='0.875rem' width='6rem' />
          <Skeleton height='0.75rem' width='4rem' />
        </div>
        <SkeletonText lines={2} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CommentSectionSkeleton -- N comment skeletons
// ---------------------------------------------------------------------------

interface CommentSectionSkeletonProps {
  count?: number;
}

/** Divided list of `count` comment skeletons. */
export function CommentSectionSkeleton({ count = 3 }: CommentSectionSkeletonProps) {
  return (
    <div className='divide-y' style={{ borderColor: 'var(--border-primary)' }}>
      {Array.from({ length: count }, (_, i) => <CommentSkeleton key={i} />)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PageSkeleton -- full-page fallback for Suspense boundaries
// ---------------------------------------------------------------------------

/** Generic full-page placeholder used as a Suspense fallback. */
export function PageSkeleton() {
  return (
    <div className='mx-auto max-w-4xl px-6 py-12 space-y-6'>
      <Skeleton height='2rem' width='50%' />
      <Skeleton height='1rem' width='30%' />
      <div className='space-y-4'>
        <Skeleton height='8rem' />
        <Skeleton height='8rem' />
        <Skeleton height='4rem' />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// UserProfileSkeleton
// ---------------------------------------------------------------------------

/** Placeholder mirroring the user profile header and recipe grid. */
export function UserProfileSkeleton() {
  return (
    <div className='mx-auto max-w-4xl px-6 py-8 space-y-6'>
      <div className='flex items-center gap-4'>
        <Skeleton circle width='4rem' height='4rem' />
        <div className='space-y-2'>
          <Skeleton height='1.5rem' width='10rem' />
          <Skeleton height='0.875rem' width='6rem' />
        </div>
      </div>
      <SkeletonText lines={2} />
      <RecipeCardSkeletonGrid count={3} />
    </div>
  );
}
