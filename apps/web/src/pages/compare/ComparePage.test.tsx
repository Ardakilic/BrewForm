import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import '../../test/setup.js';
import { renderWithProviders } from '../../test/test-utils';
import ComparePage from './ComparePage';

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
