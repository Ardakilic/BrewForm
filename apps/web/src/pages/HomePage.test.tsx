/**
 * HomePage Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test/test-utils';
import HomePage from './HomePage';

vi.mock('swr', () => ({
  default: vi.fn(() => ({
    data: [],
    isLoading: false,
    error: undefined,
  })),
}));

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
