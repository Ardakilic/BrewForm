/**
 * RegisterPage Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/test-utils';
import RegisterPage from './RegisterPage';

vi.mock('../../utils/api', () => ({
  api: {
    post: vi.fn(),
  },
}));

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    renderWithProviders(<RegisterPage />);
    expect(document.body).toBeTruthy();
  });

  it('renders form elements', () => {
    renderWithProviders(<RegisterPage />);
    const inputs = screen.queryAllByRole('textbox');
    const buttons = screen.queryAllByRole('button');
    expect(inputs.length + buttons.length).toBeGreaterThan(0);
  });

  it('renders links', () => {
    renderWithProviders(<RegisterPage />);
    const links = screen.queryAllByRole('link');
    expect(links.length).toBeGreaterThan(0);
  });
});
