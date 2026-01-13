import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { renderWithProviders } from '../../test/test-utils';
import UsersPage from './UsersPage';

vi.mock('swr', () => ({
  default: vi.fn(() => ({
    data: [],
    isLoading: false,
    error: undefined,
    mutate: vi.fn(),
    isValidating: false,
  })),
}));

describe('Admin UsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    renderWithProviders(<UsersPage />);
    expect(document.body).toBeTruthy();
  });

  it('renders content', () => {
    renderWithProviders(<UsersPage />);
    const content = document.body.textContent;
    expect(content?.length).toBeGreaterThan(0);
  });
});
