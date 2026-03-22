import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import '../../test/setup.ts';
import { renderWithProviders } from '../../test/test-utils.tsx';
import UsersPage from './UsersPage.tsx';

describe('Admin UsersPage', () => {

  it('renders without crashing', () => {
    renderWithProviders(<UsersPage />);
    expect(document.body).toBeTruthy();
  });

  it('renders content', () => {
    renderWithProviders(<UsersPage />);
    const content = document.body.textContent;
    expect(content?.length).toBeGreaterThan(0);
  });
});
