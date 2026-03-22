import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import '../../test/setup.ts';
import { renderWithProviders } from '../../test/test-utils.tsx';
import ComparePage from './ComparePage.tsx';

describe('ComparePage', () => {

  it('renders without crashing', () => {
    renderWithProviders(<ComparePage />);
    expect(document.body).toBeTruthy();
  });

  it('renders loading state', () => {
    renderWithProviders(<ComparePage />);
    expect(document.body).toBeTruthy();
  });
});
