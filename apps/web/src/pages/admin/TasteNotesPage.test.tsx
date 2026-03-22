import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import '../../test/setup.ts';
import { renderWithProviders } from '../../test/test-utils.tsx';
import TasteNotesPage from './TasteNotesPage.tsx';

describe('Admin TasteNotesPage', () => {

  it('renders without crashing', () => {
    renderWithProviders(<TasteNotesPage />);
    expect(document.body).toBeTruthy();
  });

  it('renders content', () => {
    renderWithProviders(<TasteNotesPage />);
    const content = document.body.textContent;
    expect(content?.length).toBeGreaterThan(0);
  });
});
