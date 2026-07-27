import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Breadcrumb } from './Breadcrumb.tsx';

vi.mock('react-router', () => ({
  Link: (
    { to, children, ...props }: { to: string; children: React.ReactNode; [key: string]: unknown },
  ) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: () => ({
    t: (key: string) => key === 'a11y.breadcrumb' ? 'Breadcrumb' : key,
    locale: 'en',
  }),
}));

describe('Breadcrumb', () => {
  it('renders a nav with an aria-label and an ordered list', () => {
    const { container } = render(<Breadcrumb items={[{ label: 'Home' }]} />);
    expect(container.querySelector('nav[aria-label="Breadcrumb"]')).toBeInTheDocument();
    expect(container.querySelector('ol')).toBeInTheDocument();
  });

  it('renders each item as a list item', () => {
    const { container } = render(
      <Breadcrumb items={[{ label: 'Recipes', to: '/recipes' }, { label: 'Pour Over' }]} />,
    );
    const items = container.querySelectorAll('li');
    // Recipes link, separator, current page
    expect(items.length).toBe(3);
  });

  it('renders non-final items with `to` as links', () => {
    render(<Breadcrumb items={[{ label: 'Recipes', to: '/recipes' }, { label: 'Pour Over' }]} />);
    const link = screen.getByText('Recipes').closest('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('/recipes');
  });

  it('marks the last item as the current page', () => {
    const { container } = render(
      <Breadcrumb items={[{ label: 'Recipes', to: '/recipes' }, { label: 'Pour Over' }]} />,
    );
    const current = container.querySelector('li[aria-current="page"]');
    expect(current?.textContent).toBe('Pour Over');
  });

  it('renders a separator between items but not before the first', () => {
    const { container } = render(
      <Breadcrumb
        items={[{ label: 'A', to: '/a' }, { label: 'B', to: '/b' }, { label: 'C' }]}
      />,
    );
    const separators = container.querySelectorAll('li[aria-hidden="true"]');
    expect(separators.length).toBe(2);
  });

  it('renders an item without `to` as plain text (not a link)', () => {
    render(<Breadcrumb items={[{ label: 'Recipes', to: '/recipes' }, { label: 'Plain' }]} />);
    expect(screen.getByText('Plain').closest('a')).toBeNull();
  });
});
