/**
 * HomePage Tests
 */

import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import '../test/setup.js';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test/test-utils';
import HomePage from './HomePage';

describe('HomePage', () => {

  it('renders without crashing', () => {
    renderWithProviders(<HomePage />);
    expect(document.body).toBeTruthy();
  });

  it('renders content', () => {
    renderWithProviders(<HomePage />);
    const content = document.body.textContent;
    expect(content?.length).toBeGreaterThan(0);
  });

  it('renders links', () => {
    renderWithProviders(<HomePage />);
    const links = screen.queryAllByRole('link');
    expect(links.length).toBeGreaterThan(0);
  });
});
