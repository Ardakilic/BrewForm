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

  it('uses added status colors when status="added"', () => {
    render(<DiffHighlighter labelKey='recipe.dose' value1={null} value2={20} status='added' />);
    const row = screen.getByText('recipe.dose').closest('.grid') as HTMLElement;
    expect(row.style.backgroundColor).toBe('var(--diff-added-bg)');
    expect((screen.getByText('20') as HTMLElement).style.color).toBe('var(--diff-added-text)');
  });

  it('uses removed status colors when status="removed"', () => {
    render(<DiffHighlighter labelKey='recipe.dose' value1={18} value2={null} status='removed' />);
    const row = screen.getByText('recipe.dose').closest('.grid') as HTMLElement;
    expect(row.style.backgroundColor).toBe('var(--diff-removed-bg)');
    expect((screen.getByText('18') as HTMLElement).style.color).toBe('var(--diff-removed-text)');
  });

  it('uses modified status colors when status="modified"', () => {
    render(<DiffHighlighter labelKey='recipe.dose' value1={18} value2={20} status='modified' />);
    const row = screen.getByText('recipe.dose').closest('.grid') as HTMLElement;
    expect(row.style.backgroundColor).toBe('var(--diff-modified-bg)');
    expect((screen.getByText('18') as HTMLElement).style.color).toBe('var(--diff-modified-text)');
    expect((screen.getByText('20') as HTMLElement).style.color).toBe('var(--diff-modified-text)');
  });

  it('uses transparent bg and primary text when status="unchanged"', () => {
    render(<DiffHighlighter labelKey='recipe.dose' value1={18} value2={18} status='unchanged' />);
    const row = screen.getByText('recipe.dose').closest('.grid') as HTMLElement;
    expect(row.style.backgroundColor).toBe('transparent');
    expect((screen.getAllByText('18')[0] as HTMLElement).style.color).toBe('var(--text-primary)');
  });

  it('preserves binary highlight when no status prop and values differ', () => {
    render(<DiffHighlighter labelKey='recipe.dose' value1={18} value2={20} />);
    const row = screen.getByText('recipe.dose').closest('.grid') as HTMLElement;
    expect(row.style.backgroundColor).toBe('var(--diff-highlight, rgba(255, 200, 0, 0.1))');
    expect((screen.getByText('18') as HTMLElement).style.color).toBe('var(--accent-primary)');
    expect((screen.getByText('20') as HTMLElement).style.color).toBe('var(--accent-secondary)');
  });
});
