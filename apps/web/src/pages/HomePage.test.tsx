/**
 * HomePage Tests
 */

import { describe, it } from '@std/testing';
import { expect } from '@std/expect';
import '../test/setup.ts';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test/test-utils.tsx';
import HomePage from './HomePage.tsx';

describe('HomePage', () => {
  it('renders hero section with title and subtitle', () => {
    renderWithProviders(<HomePage />);
    expect(
      screen.getByText(/Discover & Share Coffee Recipes/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Document your coffee brewing journey/i),
    ).toBeInTheDocument();
  });

  it('renders CTA buttons', () => {
    renderWithProviders(<HomePage />);
    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThanOrEqual(2);
  });

  it('renders features section', () => {
    renderWithProviders(<HomePage />);
    expect(screen.getByText(/Why BrewForm/i)).toBeInTheDocument();
  });
});
