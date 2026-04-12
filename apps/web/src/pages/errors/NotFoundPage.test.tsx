/**
 * NotFoundPage Tests
 */

import { describe, it } from '@std/testing';
import { expect } from '@std/expect';
import '../../test/setup.ts';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/test-utils.tsx';
import NotFoundPage from './NotFoundPage.tsx';

describe('NotFoundPage', () => {
  it('renders not found message', () => {
    renderWithProviders(<NotFoundPage />);
    expect(screen.getByText(/not found|404/i)).toBeInTheDocument();
  });

  it('renders link back to home', () => {
    renderWithProviders(<NotFoundPage />);
    expect(screen.getByRole('link')).toBeInTheDocument();
  });
});
