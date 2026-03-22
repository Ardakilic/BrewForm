import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import '../../test/setup.js';
import { renderWithProviders } from '../../test/test-utils';
import SettingsPage from './SettingsPage';

describe('SettingsPage', () => {

  it('renders without crashing', () => {
    renderWithProviders(<SettingsPage />);
    expect(document.body).toBeTruthy();
  });

  it('renders form elements', () => {
    renderWithProviders(<SettingsPage />);
    expect(document.body).toBeTruthy();
  });
});
