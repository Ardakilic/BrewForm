import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import '../../test/setup.ts';
import { renderWithProviders } from '../../test/test-utils.tsx';
import EquipmentPage from './EquipmentPage.tsx';

describe('Admin EquipmentPage', () => {

  it('renders without crashing', () => {
    renderWithProviders(<EquipmentPage />);
    expect(document.body).toBeTruthy();
  });

  it('renders content', () => {
    renderWithProviders(<EquipmentPage />);
    const content = document.body.textContent;
    expect(content?.length).toBeGreaterThan(0);
  });
});
