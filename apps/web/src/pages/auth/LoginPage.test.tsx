/**
 * LoginPage Tests
 */

import { describe, it } from '@std/testing';
import { expect } from '@std/expect';
import '../../test/setup.ts';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/test-utils.tsx';
import LoginPage from './LoginPage.tsx';

describe('LoginPage', () => {
  it('renders login form with email and password fields', () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('renders submit button', () => {
    renderWithProviders(<LoginPage />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('renders forgot password and signup links', () => {
    renderWithProviders(<LoginPage />);
    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThanOrEqual(2);
  });
});
