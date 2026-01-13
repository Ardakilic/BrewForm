/**
 * ProfilePage Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/test-utils';
import ProfilePage from './ProfilePage';

vi.mock('swr', () => ({
  default: vi.fn(() => ({
    data: {
      id: 'user_1',
      username: 'testuser',
      displayName: 'Test User',
      bio: 'Coffee enthusiast',
      email: 'test@example.com',
    },
    isLoading: false,
    error: undefined,
    mutate: vi.fn(),
  })),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 'user_1', username: 'testuser', displayName: 'Test User' },
    isAuthenticated: true,
    isLoading: false,
  })),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders profile page', () => {
    renderWithProviders(<ProfilePage />);
    const content = document.body.textContent;
    expect(content).toBeTruthy();
  });

  it('renders profile heading or user info', () => {
    renderWithProviders(<ProfilePage />);
    const headings = screen.queryAllByRole('heading');
    expect(headings.length).toBeGreaterThan(0);
  });
});
