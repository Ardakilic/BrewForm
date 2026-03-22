/**
 * ForgotPasswordPage Tests
 */

import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import '../../test/setup.js';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/test-utils';
import ForgotPasswordPage from './ForgotPasswordPage';

describe('ForgotPasswordPage', () => {

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
