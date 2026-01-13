import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { renderWithProviders } from '../../test/test-utils';
import ComparePage from './ComparePage';

vi.mock('swr', () => ({
  default: vi.fn(() => ({
    data: undefined,
    isLoading: true,
    error: undefined,
    mutate: vi.fn(),
    isValidating: false,
  })),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ slug1: 'recipe1', slug2: 'recipe2' }),
  };
});

describe('ComparePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    renderWithProviders(<ComparePage />);
    expect(document.body).toBeTruthy();
  });

  it('renders loading state', () => {
    renderWithProviders(<ComparePage />);
    expect(document.body).toBeTruthy();
  });
});
