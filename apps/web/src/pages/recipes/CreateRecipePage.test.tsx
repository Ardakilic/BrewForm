/**
 * CreateRecipePage Tests
 */

import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import '../../test/setup.js';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/test-utils';
import CreateRecipePage from './CreateRecipePage';

describe('CreateRecipePage', () => {

  it('renders without crashing', () => {
    renderWithProviders(<CreateRecipePage />);
    expect(document.body).toBeTruthy();
  });

  it('renders form content', () => {
    renderWithProviders(<CreateRecipePage />);
    const content = document.body.textContent;
    expect(content?.length).toBeGreaterThan(0);
  });

  it('renders buttons', () => {
    renderWithProviders(<CreateRecipePage />);
    const buttons = screen.queryAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });
});
