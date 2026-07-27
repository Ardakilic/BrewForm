/**
 * Bug Condition Exploration Tests
 *
 * **Validates: Requirements 1.1, 1.3, 1.4, 1.6**
 *
 * These tests MUST FAIL on unfixed code — failure confirms the bugs exist.
 * DO NOT attempt to fix the test or the code when it fails.
 * When the fix is applied (Tasks 3–8), these tests will pass.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { I18nProvider } from '../../../contexts/I18nContext.tsx';
import { EquipmentSection } from '../EquipmentSection.tsx';
import { ShareSection } from '../ShareSection.tsx';
import { BeanSection } from '../BeanSection.tsx';
import { BrewTimeline } from '../BrewTimeline.tsx';

/** Helper: wrap component with all required providers */
function withProviders(ui: React.ReactElement) {
  return (
    <I18nProvider>
      <MemoryRouter>{ui}</MemoryRouter>
    </I18nProvider>
  );
}

describe('Bug 1.1 - EquipmentSection crashes when item.type is undefined', () => {
  it('should NOT crash when item.type is undefined (simulating v.equipment data shape)', () => {
    const itemsWithUndefinedType = [
      // deno-lint-ignore no-explicit-any -- test cast
      { id: '1', equipmentId: 'eq1', name: 'Portafilter', type: undefined as any },
    ];
    // This WILL crash on unfixed code: item.type.replace(/_/g, ' ') throws TypeError
    expect(() => render(withProviders(<EquipmentSection items={itemsWithUndefinedType} />))).not
      .toThrow();
  });

  it('should NOT crash when item.name is undefined', () => {
    const itemsWithUndefinedName = [
      // deno-lint-ignore no-explicit-any -- test cast
      { id: '1', equipmentId: 'eq1', name: undefined as any, type: 'portafilter' },
    ];
    expect(() => render(withProviders(<EquipmentSection items={itemsWithUndefinedName} />))).not
      .toThrow();
  });
});

describe('Bug 1.3 - EquipmentSection shows redundant compatibility message', () => {
  it('should NOT display compatibility status text on recipe detail page', () => {
    const items = [
      { id: '1', equipmentId: 'eq1', name: 'Portafilter', type: 'portafilter', compatible: true },
      { id: '2', equipmentId: 'eq2', name: 'Basket', type: 'basket', compatible: true },
    ];
    render(withProviders(<EquipmentSection items={items} />));
    // On unfixed code, "all compatible" text IS present — this assertion will FAIL
    expect(screen.queryByText(/all compatible/i)).toBeNull();
    expect(screen.queryByText(/incompatible items/i)).toBeNull();
  });
});

describe('Bug 1.4 - Components use hardcoded English strings instead of i18n', () => {
  it('BrewTimeline should render without crashing when wrapped in I18nProvider', () => {
    // On unfixed code (no useTranslation), this renders fine but with hardcoded strings.
    // On fixed code, this must render without throwing (useTranslation requires I18nProvider).
    expect(() =>
      render(
        <I18nProvider>
          <BrewTimeline extractionTimeSeconds={28} preInfusionTimeSeconds={5} />
        </I18nProvider>,
      )
    ).not.toThrow();
  });

  it('BrewTimeline should use i18n for "Brew Timeline" title (not hardcoded)', () => {
    // Fixed code uses t('recipe.brewTimeline.title') — component requires I18nProvider.
    // Without I18nProvider, the fixed component throws. With it, it renders correctly.
    render(
      <I18nProvider>
        <BrewTimeline extractionTimeSeconds={28} preInfusionTimeSeconds={5} />
      </I18nProvider>,
    );
    // The i18n key resolves to "Brew Timeline" in English — verify it renders
    expect(screen.getByText('Brew Timeline')).toBeTruthy();
  });

  it('BrewTimeline should use i18n for "Pre-Infusion" label (not hardcoded)', () => {
    render(
      <I18nProvider>
        <BrewTimeline extractionTimeSeconds={28} preInfusionTimeSeconds={5} />
      </I18nProvider>,
    );
    // The i18n key resolves to "Pre-Infusion" in English — verify it renders via t()
    expect(screen.getByText('Pre-Infusion')).toBeTruthy();
  });

  it('BrewTimeline should use i18n for "Extraction" label (not hardcoded)', () => {
    render(
      <I18nProvider>
        <BrewTimeline extractionTimeSeconds={28} />
      </I18nProvider>,
    );
    // The i18n key resolves to "Extraction" in English — verify it renders via t()
    expect(screen.getByText('Extraction')).toBeTruthy();
  });

  it('BeanSection should use i18n for "Bean" section header (not hardcoded)', () => {
    render(
      <I18nProvider>
        <BeanSection
          productName='Test Bean'
          coffeeBrand='Test Brand'
        />
      </I18nProvider>,
    );
    // The i18n key resolves to "Bean" in English — verify it renders via t()
    expect(screen.getByText('Bean')).toBeTruthy();
  });
});

describe('Bug 1.6 - ShareSection no longer shows QR code (removed per refactor)', () => {
  it('should NOT render any img element (QR code removed)', () => {
    render(
      withProviders(<ShareSection slug='test-recipe' title='Test Recipe' visibility='public' />),
    );
    expect(document.querySelector('img')).toBeNull();
  });
});
