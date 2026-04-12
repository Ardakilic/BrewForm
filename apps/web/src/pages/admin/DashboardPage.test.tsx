import { describe, it } from '@std/testing';
import { expect } from '@std/expect';
import '../../test/setup.ts';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/test-utils.tsx';
import DashboardPage from './DashboardPage.tsx';

describe('Admin DashboardPage', () => {
  it('renders admin dashboard', () => {
    renderWithProviders(<DashboardPage />);
    const content = document.body.textContent;
    expect(content).toBeTruthy();
  });

  it('renders statistics or overview', () => {
    renderWithProviders(<DashboardPage />);
    const headings = screen.queryAllByRole('heading');
    expect(headings.length).toBeGreaterThan(0);
  });
});
