import { describe, it } from '@std/testing';
import { expect } from '@std/expect';
import '../../test/setup.ts';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/test-utils.tsx';
import SettingsPage from './SettingsPage.tsx';

describe('SettingsPage', () => {
  it('renders settings form', () => {
    renderWithProviders(<SettingsPage />);
    const content = document.body.textContent;
    expect(content?.length).toBeGreaterThan(0);
  });

  it('renders save or update button', () => {
    renderWithProviders(<SettingsPage />);
    const button = screen.getByRole('button', { name: /save/i });
    expect(button).toBeInTheDocument();
  });
});
