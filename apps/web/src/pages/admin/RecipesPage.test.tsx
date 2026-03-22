import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import '../../test/setup.ts';
import { renderWithProviders } from '../../test/test-utils.tsx';
import RecipesPage from './RecipesPage.tsx';

describe('Admin RecipesPage', () => {

  it('renders without crashing', () => {
    renderWithProviders(<RecipesPage />);
    expect(document.body).toBeTruthy();
  });

  it('renders content', () => {
    renderWithProviders(<RecipesPage />);
    const content = document.body.textContent;
    expect(content?.length).toBeGreaterThan(0);
  });
});
