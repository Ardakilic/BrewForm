import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  CommentSectionSkeleton,
  CommentSkeleton,
  PageSkeleton,
  RecipeCardSkeleton,
  RecipeCardSkeletonGrid,
  RecipeDetailSkeleton,
  Skeleton,
  SkeletonText,
  UserProfileSkeleton,
} from './Skeleton.tsx';

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

describe('Skeleton', () => {
  it('renders with animate-pulse class', () => {
    const { container } = render(<Skeleton />);
    const el = container.querySelector('.animate-pulse');
    expect(el).toBeInTheDocument();
  });

  it('renders with rounded class by default (not circle)', () => {
    const { container } = render(<Skeleton />);
    const el = container.querySelector('.rounded');
    expect(el).toBeInTheDocument();
    expect(container.querySelector('.rounded-full')).toBeNull();
  });

  it('renders with rounded-full class when circle is true', () => {
    const { container } = render(<Skeleton circle />);
    const el = container.querySelector('.rounded-full');
    expect(el).toBeInTheDocument();
    expect(container.querySelector('.rounded')).toBeNull();
  });

  it('applies width and height as inline style', () => {
    const { container } = render(<Skeleton width='5rem' height='2rem' />);
    const el = container.querySelector('.animate-pulse') as HTMLElement;
    expect(el.style.width).toBe('5rem');
    expect(el.style.height).toBe('2rem');
  });

  it('applies background color from CSS variable', () => {
    const { container } = render(<Skeleton />);
    const el = container.querySelector('.animate-pulse') as HTMLElement;
    expect(el.style.backgroundColor).toBe('var(--bg-tertiary)');
  });

  it('combines custom className with defaults', () => {
    const { container } = render(<Skeleton className='custom-class' />);
    const el = container.querySelector('.animate-pulse');
    expect(el).toBeInTheDocument();
    expect(el?.classList.contains('custom-class')).toBe(true);
    expect(el?.classList.contains('rounded')).toBe(true);
  });

  it('forwards additional style properties', () => {
    const { container } = render(<Skeleton style={{ marginTop: '1rem' }} />);
    const el = container.querySelector('.animate-pulse') as HTMLElement;
    expect(el.style.marginTop).toBe('1rem');
  });
});

// ---------------------------------------------------------------------------
// SkeletonText
// ---------------------------------------------------------------------------

describe('SkeletonText', () => {
  it('renders default 3 lines', () => {
    const { container } = render(<SkeletonText />);
    const lines = container.querySelectorAll('.space-y-2 > .animate-pulse');
    expect(lines.length).toBe(3);
  });

  it('renders custom number of lines', () => {
    const { container } = render(<SkeletonText lines={5} />);
    const lines = container.querySelectorAll('.space-y-2 > .animate-pulse');
    expect(lines.length).toBe(5);
  });

  it('sets a shorter width on the last line', () => {
    const { container } = render(<SkeletonText lines={3} />);
    const lines = container.querySelectorAll('.space-y-2 > .animate-pulse') as NodeListOf<
      HTMLElement
    >;
    const lastLine = lines[lines.length - 1];
    // Last line should use a width from the widths array (not 100%)
    expect(lastLine.style.width).not.toBe('100%');
    // All other lines should be 100%
    for (let i = 0; i < lines.length - 1; i++) {
      expect(lines[i].style.width).toBe('100%');
    }
  });

  it('has space-y-2 class on the wrapper', () => {
    const { container } = render(<SkeletonText />);
    expect(container.querySelector('.space-y-2')).toBeInTheDocument();
  });

  it('combines custom className on the wrapper', () => {
    const { container } = render(<SkeletonText className='extra-spacing' />);
    const wrapper = container.querySelector('.space-y-2');
    expect(wrapper?.classList.contains('extra-spacing')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// RecipeCardSkeleton
// ---------------------------------------------------------------------------

describe('RecipeCardSkeleton', () => {
  it('renders a card container', () => {
    const { container } = render(<RecipeCardSkeleton />);
    expect(container.querySelector('.card')).toBeInTheDocument();
  });

  it('renders multiple skeleton elements inside the card', () => {
    const { container } = render(<RecipeCardSkeleton />);
    const skeletons = container.querySelectorAll('.card .animate-pulse');
    expect(skeletons.length).toBeGreaterThanOrEqual(8);
  });

  it('renders title skeleton with 70% width', () => {
    const { container } = render(<RecipeCardSkeleton />);
    const skeletons = container.querySelectorAll('.card .animate-pulse') as NodeListOf<HTMLElement>;
    expect(skeletons[0].style.width).toBe('70%');
  });
});

// ---------------------------------------------------------------------------
// RecipeCardSkeletonGrid
// ---------------------------------------------------------------------------

describe('RecipeCardSkeletonGrid', () => {
  it('renders default 6 recipe card skeletons', () => {
    const { container } = render(<RecipeCardSkeletonGrid />);
    const cards = container.querySelectorAll('.card');
    expect(cards.length).toBe(6);
  });

  it('renders custom count of recipe card skeletons', () => {
    const { container } = render(<RecipeCardSkeletonGrid count={4} />);
    const cards = container.querySelectorAll('.card');
    expect(cards.length).toBe(4);
  });

  it('has grid layout classes', () => {
    const { container } = render(<RecipeCardSkeletonGrid />);
    const grid = container.querySelector('.grid');
    expect(grid).toBeInTheDocument();
    expect(grid?.classList.contains('gap-4')).toBe(true);
    expect(grid?.classList.contains('sm:grid-cols-2')).toBe(true);
    expect(grid?.classList.contains('lg:grid-cols-3')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// RecipeDetailSkeleton
// ---------------------------------------------------------------------------

describe('RecipeDetailSkeleton', () => {
  it('renders inside a max-w-4xl container', () => {
    const { container } = render(<RecipeDetailSkeleton />);
    expect(container.querySelector('.max-w-4xl')).toBeInTheDocument();
  });

  it('renders breadcrumb skeleton', () => {
    const { container } = render(<RecipeDetailSkeleton />);
    // First direct sibling of max-w-4xl wrapper is the breadcrumb placeholder (12rem width)
    const breadcrumb = container.querySelector(
      '.max-w-4xl > .animate-pulse',
    ) as HTMLElement;
    expect(breadcrumb).toBeInTheDocument();
    expect(breadcrumb.style.width).toBe('12rem');
  });

  it('renders title skeleton with 60% width', () => {
    const { container } = render(<RecipeDetailSkeleton />);
    const titleEl = container.querySelector('.max-w-4xl [style*="60%"]');
    expect(titleEl).toBeInTheDocument();
  });

  it('renders 4 stat cards in a grid', () => {
    const { container } = render(<RecipeDetailSkeleton />);
    const statCards = container.querySelectorAll('.grid.grid-cols-2.sm\\:grid-cols-4 .card');
    expect(statCards.length).toBe(4);
  });

  it('renders brew timeline card', () => {
    const { container } = render(<RecipeDetailSkeleton />);
    // Brew timeline is the card with 2.5rem height skeletons
    const timelineSkeletons = container.querySelectorAll(
      '.card .animate-pulse[style*="2.5rem"]',
    );
    expect(timelineSkeletons.length).toBeGreaterThanOrEqual(4);
  });

  it('renders notes section with SkeletonText', () => {
    const { container } = render(<RecipeDetailSkeleton />);
    // SkeletonText uses space-y-2 wrapper
    const skeletonTexts = container.querySelectorAll('.space-y-2');
    expect(skeletonTexts.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// CommentSkeleton
// ---------------------------------------------------------------------------

describe('CommentSkeleton', () => {
  it('renders with flex gap-3 layout', () => {
    const { container } = render(<CommentSkeleton />);
    expect(container.querySelector('.flex.gap-3')).toBeInTheDocument();
  });

  it('renders a circle avatar skeleton', () => {
    const { container } = render(<CommentSkeleton />);
    const avatar = container.querySelector('.rounded-full');
    expect(avatar).toBeInTheDocument();
    expect((avatar as HTMLElement).style.width).toBe('2.5rem');
    expect((avatar as HTMLElement).style.height).toBe('2.5rem');
  });

  it('renders text line skeletons in the comment body', () => {
    const { container } = render(<CommentSkeleton />);
    // Should have at least a name skeleton (6rem) and a date skeleton (4rem)
    const nameLine = container.querySelector('.animate-pulse[style*="6rem"]') as HTMLElement;
    const dateLine = container.querySelector('.animate-pulse[style*="4rem"]') as HTMLElement;
    expect(nameLine).not.toBeNull();
    expect(dateLine).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CommentSectionSkeleton
// ---------------------------------------------------------------------------

describe('CommentSectionSkeleton', () => {
  it('renders default 3 comment skeletons', () => {
    const { container } = render(<CommentSectionSkeleton />);
    const comments = container.querySelectorAll('.flex.gap-3');
    expect(comments.length).toBe(3);
  });

  it('renders custom count of comment skeletons', () => {
    const { container } = render(<CommentSectionSkeleton count={5} />);
    const comments = container.querySelectorAll('.flex.gap-3');
    expect(comments.length).toBe(5);
  });

  it('has divide-y class on the container', () => {
    const { container } = render(<CommentSectionSkeleton />);
    expect(container.querySelector('.divide-y')).toBeInTheDocument();
  });

  it('has border color style on the container', () => {
    const { container } = render(<CommentSectionSkeleton />);
    const wrapper = container.querySelector('.divide-y') as HTMLElement;
    expect(wrapper.style.borderColor).toBe('var(--border-primary)');
  });
});

// ---------------------------------------------------------------------------
// PageSkeleton
// ---------------------------------------------------------------------------

describe('PageSkeleton', () => {
  it('renders inside a max-w-4xl container', () => {
    const { container } = render(<PageSkeleton />);
    expect(container.querySelector('.max-w-4xl')).toBeInTheDocument();
  });

  it('renders a title skeleton with 50% width', () => {
    const { container } = render(<PageSkeleton />);
    const titleEl = container.querySelector('.max-w-4xl [style*="50%"]');
    expect(titleEl).toBeInTheDocument();
  });

  it('renders a subtitle skeleton with 30% width', () => {
    const { container } = render(<PageSkeleton />);
    const subtitleEl = container.querySelector('.max-w-4xl [style*="30%"]');
    expect(subtitleEl).toBeInTheDocument();
  });

  it('renders 3 content block skeletons', () => {
    const { container } = render(<PageSkeleton />);
    // The wrapper inside has 3 direct skeleton children (8rem, 8rem, 4rem)
    const contentBlocks = container.querySelectorAll(
      '.space-y-4 > .animate-pulse',
    );
    expect(contentBlocks.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// UserProfileSkeleton
// ---------------------------------------------------------------------------

describe('UserProfileSkeleton', () => {
  it('renders inside a max-w-4xl container', () => {
    const { container } = render(<UserProfileSkeleton />);
    expect(container.querySelector('.max-w-4xl')).toBeInTheDocument();
  });

  it('renders a circle avatar skeleton', () => {
    const { container } = render(<UserProfileSkeleton />);
    const avatar = container.querySelector('.rounded-full') as HTMLElement;
    expect(avatar).toBeInTheDocument();
    expect(avatar.style.width).toBe('4rem');
    expect(avatar.style.height).toBe('4rem');
  });

  it('renders name and bio skeleton lines', () => {
    const { container } = render(<UserProfileSkeleton />);
    const nameLine = container.querySelector('.animate-pulse[style*="10rem"]') as HTMLElement;
    const bioLine = container.querySelector('.animate-pulse[style*="6rem"]') as HTMLElement;
    expect(nameLine).not.toBeNull();
    expect(bioLine).not.toBeNull();
  });

  it('renders a SkeletonText for the bio', () => {
    const { container } = render(<UserProfileSkeleton />);
    // SkeletonText renders a space-y-2 wrapper
    const skeletonTexts = container.querySelectorAll('.space-y-2');
    expect(skeletonTexts.length).toBeGreaterThanOrEqual(1);
  });

  it('renders a RecipeCardSkeletonGrid with 3 cards', () => {
    const { container } = render(<UserProfileSkeleton />);
    const cards = container.querySelectorAll('.card');
    expect(cards.length).toBe(3);
  });
});
