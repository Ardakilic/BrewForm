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
// RecipeCardSkeletonGrid -- grid of N recipe card skeletons
// ---------------------------------------------------------------------------

interface RecipeCardSkeletonGridProps {
  count?: number;
}

export function RecipeCardSkeletonGrid({ count = 6 }: RecipeCardSkeletonGridProps) {
  return (
    <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
      {Array.from({ length: count }, (_, i) => <RecipeCardSkeleton key={i} />)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RecipeDetailSkeleton -- mirrors RecipeDetailPage layout
// ---------------------------------------------------------------------------

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
