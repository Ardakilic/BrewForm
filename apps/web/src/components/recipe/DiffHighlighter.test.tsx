import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DiffHighlighter } from './DiffHighlighter.tsx';

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    locale: 'en',
    setLocale: () => {},
    availableLocales: ['en', 'tr'],
  }),
}));

describe('DiffHighlighter', () => {
  it('highlights differing values with background and accent colors', () => {
    render(<DiffHighlighter labelKey='recipe.dose' value1={18} value2={20} />);
    const row = screen.getByText('recipe.dose').closest('.grid') as HTMLElement;
    expect(row.style.backgroundColor).toBe('var(--diff-highlight, rgba(255, 200, 0, 0.1))');
    expect((screen.getByText('18') as HTMLElement).style.color).toBe('var(--accent-primary)');
    expect((screen.getByText('20') as HTMLElement).style.color).toBe('var(--accent-secondary)');
  });

  it('does not highlight identical values', () => {
    render(<DiffHighlighter labelKey='recipe.dose' value1={18} value2={18} />);
    const row = screen.getByText('recipe.dose').closest('.grid') as HTMLElement;
    expect(row.style.backgroundColor).toBe('transparent');
  });

  it('uses the formatter when provided', () => {
    render(
      <DiffHighlighter
        labelKey='recipe.dose'
        value1={18}
        value2={18}
        formatter={(val) => (val ? `${val}g` : '-')}
      />,
    );
    expect(screen.getAllByText('18g')).toHaveLength(2);
  });

  it('shows a dash for null values', () => {
    render(<DiffHighlighter labelKey='recipe.dose' value1={null} value2={null} />);
    expect(screen.getAllByText('-')).toHaveLength(2);
  });
});
