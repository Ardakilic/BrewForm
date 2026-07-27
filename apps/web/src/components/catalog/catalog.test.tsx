import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { CategoryTabs } from './CategoryTabs.tsx';
import { CatalogEntityCard } from './CatalogEntityCard.tsx';
import { TypeBadge, varietyCategoryLabel } from './TypeBadge.tsx';

describe('TypeBadge', () => {
  it('renders the label text', () => {
    render(<TypeBadge label='espresso machine' />);
    expect(screen.getByText('espresso machine')).toBeInTheDocument();
  });

  it('applies accent-primary background', () => {
    const { container } = render(<TypeBadge label='grinder' />);
    const span = container.querySelector('span');
    expect(span?.style.backgroundColor).toBe('var(--accent-primary)');
  });
});

describe('varietyCategoryLabel', () => {
  const t = (key: string) => key;

  it('maps variety to short label key', () => {
    expect(varietyCategoryLabel(t, 'variety')).toBe('coffeeVarieties.category.varietyShort');
  });

  it('maps processing to short label key', () => {
    expect(varietyCategoryLabel(t, 'processing')).toBe('coffeeVarieties.category.processingShort');
  });

  it('maps market_name to short label key', () => {
    expect(varietyCategoryLabel(t, 'market_name')).toBe(
      'coffeeVarieties.category.marketNameShort',
    );
  });

  it('returns raw category for unknown values', () => {
    expect(varietyCategoryLabel(t, 'unknown')).toBe('unknown');
  });
});

describe('CategoryTabs', () => {
  const tabs = [
    { value: '', label: 'All' },
    { value: 'grinder', label: 'Grinder' },
    { value: 'kettle', label: 'Kettle' },
  ];

  it('renders all tab buttons', () => {
    render(<CategoryTabs tabs={tabs} active='' onSelect={() => {}} />);
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Grinder')).toBeInTheDocument();
    expect(screen.getByText('Kettle')).toBeInTheDocument();
  });

  it('applies active styling to the selected tab', () => {
    render(<CategoryTabs tabs={tabs} active='grinder' onSelect={() => {}} />);
    const activeBtn = screen.getByText('Grinder');
    expect(activeBtn.className).toContain('bg-[color:var(--accent-primary)]');
  });

  it('calls onSelect with tab value on click', async () => {
    const user = userEvent.setup();
    let selected = '';
    render(<CategoryTabs tabs={tabs} active='' onSelect={(v) => selected = v} />);
    await user.click(screen.getByText('Kettle'));
    expect(selected).toBe('kettle');
  });
});

describe('CatalogEntityCard', () => {
  it('renders title and links to the given path', () => {
    render(
      <MemoryRouter>
        <CatalogEntityCard to='/equipment/1' title='V60' />
      </MemoryRouter>,
    );
    const link = screen.getByText('V60').closest('a');
    expect(link).toHaveAttribute('href', '/equipment/1');
  });

  it('renders brand above title when provided', () => {
    render(
      <MemoryRouter>
        <CatalogEntityCard to='/equipment/1' title='V60' brand='Hario' />
      </MemoryRouter>,
    );
    expect(screen.getByText('Hario')).toBeInTheDocument();
    expect(screen.getByText('V60')).toBeInTheDocument();
  });

  it('renders badge via TypeBadge when provided', () => {
    render(
      <MemoryRouter>
        <CatalogEntityCard to='/equipment/1' title='V60' badge='pour over' />
      </MemoryRouter>,
    );
    expect(screen.getByText('pour over')).toBeInTheDocument();
  });

  it('renders line-clamped description when provided', () => {
    render(
      <MemoryRouter>
        <CatalogEntityCard to='/equipment/1' title='V60' description='A cone-shaped dripper' />
      </MemoryRouter>,
    );
    expect(screen.getByText('A cone-shaped dripper')).toBeInTheDocument();
  });

  it('renders children between header and description', () => {
    render(
      <MemoryRouter>
        <CatalogEntityCard to='/x' title='T'>
          <p data-testid='child'>extra</p>
        </CatalogEntityCard>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
