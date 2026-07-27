import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { CardSkeletonGrid, CatalogCardSkeleton } from './Skeleton.tsx';

describe('CatalogCardSkeleton', () => {
  it('renders a card container', () => {
    const { container } = render(<CatalogCardSkeleton />);
    expect(container.querySelector('.card')).toBeInTheDocument();
  });

  it('renders a rounded-full type pill skeleton', () => {
    const { container } = render(<CatalogCardSkeleton />);
    expect(container.querySelector('.card .rounded-full')).toBeInTheDocument();
  });
});

describe('CardSkeletonGrid', () => {
  it('renders the default 6 recipe card skeletons', () => {
    const { container } = render(<CardSkeletonGrid />);
    expect(container.querySelectorAll('.card').length).toBe(6);
  });

  it('renders a custom count of skeletons', () => {
    const { container } = render(<CardSkeletonGrid count={4} />);
    expect(container.querySelectorAll('.card').length).toBe(4);
  });

  it('uses the recipe grid columns by default', () => {
    const { container } = render(<CardSkeletonGrid />);
    const grid = container.querySelector('.grid');
    expect(grid?.classList.contains('sm:grid-cols-2')).toBe(true);
    expect(grid?.classList.contains('lg:grid-cols-3')).toBe(true);
  });

  it('uses the catalog grid columns and catalog cards for the catalog variant', () => {
    const { container } = render(<CardSkeletonGrid count={3} variant='catalog' />);
    const grid = container.querySelector('.grid');
    expect(grid?.classList.contains('md:grid-cols-2')).toBe(true);
    expect(grid?.classList.contains('lg:grid-cols-3')).toBe(true);
    // Catalog cards include a rounded-full type pill skeleton
    expect(container.querySelectorAll('.card .rounded-full').length).toBe(3);
  });
});
