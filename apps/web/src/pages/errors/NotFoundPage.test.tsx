/**
 * NotFoundPage Tests
 */

import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import '../../test/setup.ts';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/test-utils.tsx';
import NotFoundPage from './NotFoundPage.tsx';

describe('NotFoundPage', () => {
  it('renders without crashing', () => {
    renderWithProviders(<NotFoundPage />);
    expect(document.body).toBeTruthy();
  });

  it('renders content', () => {
    renderWithProviders(<NotFoundPage />);
    const content = document.body.textContent;
    expect(content?.length).toBeGreaterThan(0);
  });

  it('renders link', () => {
    renderWithProviders(<NotFoundPage />);
    const links = screen.queryAllByRole('link');
    expect(links.length).toBeGreaterThan(0);
  });
});
