/**
 * ErrorPage Tests
 */

import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/test-utils';
import ErrorPage from './ErrorPage';

describe('ErrorPage', () => {
  it('renders error message', () => {
    renderWithProviders(<ErrorPage />);
    expect(screen.getByText(/error|something went wrong|oops/i)).toBeInTheDocument();
  });

  it('renders link to home or retry', () => {
    renderWithProviders(<ErrorPage />);
    const link = screen.queryByRole('link') || screen.queryByRole('button');
    expect(link).toBeInTheDocument();
  });
});
