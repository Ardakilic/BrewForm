import { describe, it } from '@std/testing';
import { expect } from '@std/expect';
import '../../test/setup.ts';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/test-utils.tsx';
import RecipeDetailPage from './RecipeDetailPage.tsx';

describe('RecipeDetailPage', () => {
  it('renders recipe detail page', () => {
    renderWithProviders(<RecipeDetailPage />);
    const content = document.body.textContent;
    expect(content).toBeTruthy();
  });

  it('renders recipe information', () => {
    renderWithProviders(<RecipeDetailPage />);
    const headings = screen.queryAllByRole('heading');
    expect(headings.length).toBeGreaterThan(0);
  });
});
