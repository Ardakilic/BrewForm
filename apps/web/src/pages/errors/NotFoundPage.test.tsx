/**
 * NotFoundPage Tests
 */

import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/test-utils';
import NotFoundPage from './NotFoundPage';

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
