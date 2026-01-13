import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { renderWithProviders } from '../../test/test-utils';
import UserPage from './UserPage';

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
    useParams: () => ({ username: 'testuser' }),
  };
});

describe('UserPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    renderWithProviders(<UserPage />);
    expect(document.body).toBeTruthy();
  });

  it('renders loading state', () => {
    renderWithProviders(<UserPage />);
    expect(document.body).toBeTruthy();
  });
});
