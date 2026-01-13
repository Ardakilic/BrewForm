/**
 * LoginPage Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/test-utils';
import LoginPage from './LoginPage';

vi.mock('../../utils/api', () => ({
  api: {
    post: vi.fn(),
  },
}));

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    renderWithProviders(<LoginPage />);
    expect(document.body).toBeTruthy();
  });

  it('renders form elements', () => {
    renderWithProviders(<LoginPage />);
    const inputs = screen.queryAllByRole('textbox');
    const buttons = screen.queryAllByRole('button');
    expect(inputs.length + buttons.length).toBeGreaterThan(0);
  });

  it('renders links', () => {
    renderWithProviders(<LoginPage />);
    const links = screen.queryAllByRole('link');
    expect(links.length).toBeGreaterThan(0);
  });
});
