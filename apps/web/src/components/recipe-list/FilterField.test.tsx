import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FilterField } from './FilterField.tsx';

describe('FilterField', () => {
  it('should render the label', () => {
    render(
      <FilterField label='Brew Method'>
        <select />
      </FilterField>,
    );
    expect(screen.getByText('Brew Method')).toBeInTheDocument();
  });

  it('should render children', () => {
    render(
      <FilterField label='X'>
        <div data-testid='child' />
      </FilterField>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
