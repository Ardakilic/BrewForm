/**
 * ForgotPasswordPage Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/test-utils';
import ForgotPasswordPage from './ForgotPasswordPage';

vi.mock('../../utils/api', () => ({
  api: {
    post: vi.fn(),
  },
}));

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    renderWithProviders(<ForgotPasswordPage />);
    expect(document.body).toBeTruthy();
  });

  it('renders form elements', () => {
    renderWithProviders(<ForgotPasswordPage />);
    const buttons = screen.queryAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('renders links', () => {
    renderWithProviders(<ForgotPasswordPage />);
    const links = screen.queryAllByRole('link');
    expect(links.length).toBeGreaterThan(0);
  });
});
