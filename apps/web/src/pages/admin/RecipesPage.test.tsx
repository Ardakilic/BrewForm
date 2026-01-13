import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { renderWithProviders } from '../../test/test-utils';
import RecipesPage from './RecipesPage';

vi.mock('swr', () => ({
  default: vi.fn(() => ({
    data: [],
    isLoading: false,
    error: undefined,
    mutate: vi.fn(),
    isValidating: false,
  })),
}));

describe('Admin RecipesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
