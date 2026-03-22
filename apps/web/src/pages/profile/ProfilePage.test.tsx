/**
 * ProfilePage Tests
 */

import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import '../../test/setup.js';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/test-utils';
import ProfilePage from './ProfilePage';

describe('ProfilePage', () => {

  it('renders profile page', () => {
    renderWithProviders(<ProfilePage />);
    const content = document.body.textContent;
    expect(content).toBeTruthy();
  });

  it('renders profile heading or user info', () => {
    renderWithProviders(<ProfilePage />);
    const headings = screen.queryAllByRole('heading');
    expect(headings.length).toBeGreaterThan(0);
  });
});
