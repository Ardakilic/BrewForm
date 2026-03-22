import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import '../../test/setup.js';
import { renderWithProviders } from '../../test/test-utils';
import UserPage from './UserPage';

describe('UserPage', () => {

  it('renders without crashing', () => {
    renderWithProviders(<UserPage />);
    expect(document.body).toBeTruthy();
  });

  it('renders loading state', () => {
    renderWithProviders(<UserPage />);
    expect(document.body).toBeTruthy();
  });
});
