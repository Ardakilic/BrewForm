/**
 * Tests for BreadcrumbNav component — breadcrumb title truncation
 *
 * Property 1: Breadcrumb title truncation
 * Validates: Requirements 1.1
 *
 * For any recipe title string, the breadcrumb's final segment SHALL be at most
 * 40 characters long; if the original title exceeds 40 characters, the displayed
 * text SHALL be the first 37 characters followed by "…" (ellipsis), and if 40 or
 * fewer characters, the full title is displayed unchanged.
 */

import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import fc from 'fast-check';
import { BreadcrumbNav } from './BreadcrumbNav.tsx';

vi.mock('react-router', () => ({
  Link: (
    { to, children, ...props }: { to: string; children: React.ReactNode; [key: string]: unknown },
  ) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@brewform/shared/constants', () => ({
  BREW_METHODS: [],
}));

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    locale: 'en',
    setLocale: vi.fn(),
    availableLocales: ['en', 'tr'],
  }),
}));

/** Renders BreadcrumbNav and returns the text content of the last <li> element */
function getLastSegmentText(title: string): string {
  const { container } = render(<BreadcrumbNav brewMethod={null} recipeTitle={title} />);
  const items = container.querySelectorAll('li');
  const lastItem = items[items.length - 1];
  return lastItem?.textContent ?? '';
}

// ---------------------------------------------------------------------------
// Unit tests — specific examples
// ---------------------------------------------------------------------------

describe('BreadcrumbNav — title truncation unit tests', () => {
  it('displays a title of exactly 40 chars unchanged', () => {
    const title = 'A'.repeat(40);
    expect(getLastSegmentText(title)).toBe(title);
  });

  it('truncates a title of 41 chars to 37 chars + "…" (total 38 chars)', () => {
    const title = 'A'.repeat(41);
    const displayed = getLastSegmentText(title);
    expect(displayed).toBe('A'.repeat(37) + '…');
    expect(displayed.length).toBe(38); // 37 chars + 1 ellipsis character
  });

  it('displays a title of 37 chars unchanged', () => {
    const title = 'A'.repeat(37);
    expect(getLastSegmentText(title)).toBe(title);
  });

  it('displays a title of 1 char unchanged', () => {
    const title = 'X';
    expect(getLastSegmentText(title)).toBe(title);
  });

  it('displays an empty string unchanged', () => {
    expect(getLastSegmentText('')).toBe('');
  });

  it('truncates a title of 100 chars to 37 chars + "…"', () => {
    const title = 'B'.repeat(100);
    const displayed = getLastSegmentText(title);
    expect(displayed).toBe('B'.repeat(37) + '…');
  });
});

// ---------------------------------------------------------------------------
// Property-based test — Property 1: Breadcrumb title truncation
// Validates: Requirements 1.1
// ---------------------------------------------------------------------------

describe('BreadcrumbNav — Property 1: Breadcrumb title truncation', () => {
  it('for any string of length ≤ 40, the displayed title equals the original', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 40 }),
        (title) => {
          const displayed = getLastSegmentText(title);
          expect(displayed).toBe(title);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('for any string of length > 40, the displayed title is exactly 38 chars (37 + "…")', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 41, maxLength: 500 }),
        (title) => {
          const displayed = getLastSegmentText(title);
          // Must end with the ellipsis character
          expect(displayed.endsWith('…')).toBe(true);
          // Must be exactly 38 characters (37 content chars + 1 ellipsis)
          expect(displayed.length).toBe(38);
          // The first 37 chars must match the original title's first 37 chars
          expect(displayed.slice(0, 37)).toBe(title.slice(0, 37));
        },
      ),
      { numRuns: 200 },
    );
  });

  it('for any string, the displayed title is always ≤ 40 chars', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 500 }),
        (title) => {
          const displayed = getLastSegmentText(title);
          expect(displayed.length).toBeLessThanOrEqual(40);
        },
      ),
      { numRuns: 200 },
    );
  });
});
