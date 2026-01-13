/**
 * CreateRecipePage Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/test-utils';
import CreateRecipePage from './CreateRecipePage';

vi.mock('swr', () => ({
  default: vi.fn(() => ({
    data: [],
    isLoading: false,
    error: undefined,
  })),
}));

vi.mock('../../utils/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn(),
  },
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 'user_1', username: 'testuser' },
    isAuthenticated: true,
    isLoading: false,
  })),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

describe('CreateRecipePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    renderWithProviders(<CreateRecipePage />);
    expect(document.body).toBeTruthy();
  });

  it('renders form content', () => {
    renderWithProviders(<CreateRecipePage />);
    const content = document.body.textContent;
    expect(content?.length).toBeGreaterThan(0);
  });

  it('renders buttons', () => {
    renderWithProviders(<CreateRecipePage />);
    const buttons = screen.queryAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });
});
