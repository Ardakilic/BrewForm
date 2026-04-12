/**
 * RegisterPage Tests
 */

import { describe, it } from '@std/testing';
import { expect } from '@std/expect';
import '../../test/setup.ts';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/test-utils.tsx';
import RegisterPage from './RegisterPage.tsx';

describe('RegisterPage', () => {
  it('renders registration form with required fields', () => {
    renderWithProviders(<RegisterPage />);
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^username$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
  });

  it('renders submit button', () => {
    renderWithProviders(<RegisterPage />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('renders login link', () => {
    renderWithProviders(<RegisterPage />);
    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThan(0);
  });
});
