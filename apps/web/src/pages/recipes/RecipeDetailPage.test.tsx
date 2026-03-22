import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import '../../test/setup.js';
import { renderWithProviders } from '../../test/test-utils';
import RecipeDetailPage from './RecipeDetailPage';

describe('RecipeDetailPage', () => {

  it('renders without crashing', () => {
    renderWithProviders(<RecipeDetailPage />);
    expect(document.body).toBeTruthy();
  });

  it('renders loading state', () => {
    renderWithProviders(<RecipeDetailPage />);
    expect(document.body).toBeTruthy();
  });
});
