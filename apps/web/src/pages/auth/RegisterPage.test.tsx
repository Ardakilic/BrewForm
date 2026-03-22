/**
 * RegisterPage Tests
 */

import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import '../../test/setup.ts';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/test-utils.tsx';
import RegisterPage from './RegisterPage.tsx';

describe('RegisterPage', () => {

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
