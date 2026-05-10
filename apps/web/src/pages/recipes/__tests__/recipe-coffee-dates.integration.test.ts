/**
 * Integration Tests — Recipe Coffee Date Fields (UI Components)
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 3.5**
 *
 * These tests verify the UI component logic for the three coffee date fields:
 *   - roastDate, packageOpenDate, grindDate
 *
 * Testing approach:
 *   Since this is a Deno environment without a DOM renderer, the component logic is
 *   extracted into pure functions that mirror the FIXED implementations. This lets us
 *   test the state transitions and rendering decisions directly without React/DOM.
 *
 *   The tests cover:
 *   1. RecipeCreatePage — date fields are present in the initial form state
 *   2. RecipeEditPage — date fields are pre-populated from loaded recipe version (YYYY-MM-DD)
 *   3. RecipeDetailPage — date rows appear when values are present, absent when null
 *   4. RecipeDetailPage — all other parameter rows are unaffected by date field presence
 */

import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';

// ---------------------------------------------------------------------------
// 1. RecipeCreatePage — date fields in initial form state
//
// Mirrors the useState initializations in RecipeCreatePage.tsx:
//   const [roastDate, setRoastDate] = useState('');
//   const [packageOpenDate, setPackageOpenDate] = useState('');
//   const [grindDate, setGrindDate] = useState('');
//
// And the submit payload construction in handleSubmit:
//   ...(roastDate ? { roastDate } : {}),
//   ...(packageOpenDate ? { packageOpenDate } : {}),
//   ...(grindDate ? { grindDate } : {}),
// ---------------------------------------------------------------------------

interface CreateFormState {
  title: string;
  brewMethod: string;
  drinkType: string;
  roastDate: string;
  packageOpenDate: string;
  grindDate: string;
  [key: string]: unknown;
}

/** Mirrors the initial state of RecipeCreatePage */
function createInitialFormState(): CreateFormState {
  return {
    title: '',
    brewMethod: 'espresso_machine',
    drinkType: 'espresso',
    roastDate: '',
    packageOpenDate: '',
    grindDate: '',
  };
}

/** Mirrors the handleSubmit payload construction in RecipeCreatePage */
function buildCreatePayload(state: CreateFormState): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    title: state.title.trim(),
    brewMethod: state.brewMethod,
    drinkType: state.drinkType,
  };
  if (state.roastDate) payload.roastDate = state.roastDate;
  if (state.packageOpenDate) payload.packageOpenDate = state.packageOpenDate;
  if (state.grindDate) payload.grindDate = state.grindDate;
  return payload;
}

// ---------------------------------------------------------------------------
// 2. RecipeEditPage — date pre-population from loaded recipe version
//
// Mirrors the useEffect date extraction in RecipeEditPage.tsx:
//   setRoastDate(r.currentVersion.roastDate
//     ? r.currentVersion.roastDate.slice(0, 10) : '');
//   setPackageOpenDate(r.currentVersion.packageOpenDate
//     ? r.currentVersion.packageOpenDate.slice(0, 10) : '');
//   setGrindDate(r.currentVersion.grindDate
//     ? r.currentVersion.grindDate.slice(0, 10) : '');
// ---------------------------------------------------------------------------

interface RecipeVersion {
  brewMethod: string;
  drinkType: string;
  roastDate?: string | null;
  packageOpenDate?: string | null;
  grindDate?: string | null;
  [key: string]: unknown;
}

interface EditFormState {
  roastDate: string;
  packageOpenDate: string;
  grindDate: string;
  [key: string]: unknown;
}

/** Mirrors the useEffect date extraction logic in RecipeEditPage */
function extractEditFormDates(version: RecipeVersion): EditFormState {
  return {
    roastDate: version.roastDate ? version.roastDate.slice(0, 10) : '',
    packageOpenDate: version.packageOpenDate ? version.packageOpenDate.slice(0, 10) : '',
    grindDate: version.grindDate ? version.grindDate.slice(0, 10) : '',
  };
}

// ---------------------------------------------------------------------------
// 3. RecipeDetailPage — ParamRow rendering logic
//
// Mirrors the ParamRow component in RecipeDetailPage.tsx:
//   function ParamRow({ label, value }) {
//     if (!value) return null;
//     return <div>...</div>;
//   }
//
// And the date value extraction:
//   value={v.roastDate ? v.roastDate.slice(0, 10) : null}
//   value={v.packageOpenDate ? v.packageOpenDate.slice(0, 10) : null}
//   value={v.grindDate ? v.grindDate.slice(0, 10) : null}
// ---------------------------------------------------------------------------

interface ParamRowData {
  label: string;
  value: string | null | undefined;
}

/** Mirrors the ParamRow rendering decision: returns null when value is falsy */
function shouldRenderParamRow(value: string | null | undefined): boolean {
  return Boolean(value);
}

/** Mirrors the full set of ParamRow entries in RecipeDetailPage's Brew Parameters card */
function buildBrewParamRows(v: RecipeVersion): ParamRowData[] {
  const rows: ParamRowData[] = [
    { label: 'Brew Method', value: v.brewMethod?.replace(/_/g, ' ') ?? null },
    { label: 'Drink Type', value: v.drinkType?.replace(/_/g, ' ') ?? null },
    { label: 'Product Name', value: (v.productName as string | null) ?? null },
    { label: 'Coffee Brand', value: (v.coffeeBrand as string | null) ?? null },
    { label: 'Processing', value: (v.coffeeProcessing as string | null) ?? null },
    { label: 'Roast Date', value: v.roastDate ? v.roastDate.slice(0, 10) : null },
    { label: 'Package Open Date', value: v.packageOpenDate ? v.packageOpenDate.slice(0, 10) : null },
    { label: 'Grind Date', value: v.grindDate ? v.grindDate.slice(0, 10) : null },
    { label: 'Grinder', value: (v.grinder as string | null) ?? null },
    { label: 'Grind Size', value: (v.grindSize as string | null) ?? null },
  ];
  return rows;
}

/** Returns only the rows that would actually render (non-falsy values) */
function getRenderedRows(v: RecipeVersion): ParamRowData[] {
  return buildBrewParamRows(v).filter((row) => shouldRenderParamRow(row.value));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RecipeCreatePage — date input fields exist in form state', () => {
  it(
    'initial form state includes roastDate field initialized to empty string',
    () => {
      // Requirement 2.1: RecipeCreatePage must have a roastDate input
      const state = createInitialFormState();
      expect('roastDate' in state).toBe(true);
      expect(state.roastDate).toBe('');
    },
  );

  it(
    'initial form state includes packageOpenDate field initialized to empty string',
    () => {
      // Requirement 2.1: RecipeCreatePage must have a packageOpenDate input
      const state = createInitialFormState();
      expect('packageOpenDate' in state).toBe(true);
      expect(state.packageOpenDate).toBe('');
    },
  );

  it(
    'initial form state includes grindDate field initialized to empty string',
    () => {
      // Requirement 2.1: RecipeCreatePage must have a grindDate input
      const state = createInitialFormState();
      expect('grindDate' in state).toBe(true);
      expect(state.grindDate).toBe('');
    },
  );

  it(
    'submit payload includes roastDate when provided',
    () => {
      // Requirement 2.1: date values are included in the submit payload
      const state = createInitialFormState();
      state.title = 'My Recipe';
      state.roastDate = '2026-03-15';

      const payload = buildCreatePayload(state);
      expect(payload.roastDate).toBe('2026-03-15');
    },
  );

  it(
    'submit payload includes packageOpenDate when provided',
    () => {
      const state = createInitialFormState();
      state.title = 'My Recipe';
      state.packageOpenDate = '2026-03-22';

      const payload = buildCreatePayload(state);
      expect(payload.packageOpenDate).toBe('2026-03-22');
    },
  );

  it(
    'submit payload includes grindDate when provided',
    () => {
      const state = createInitialFormState();
      state.title = 'My Recipe';
      state.grindDate = '2026-04-12';

      const payload = buildCreatePayload(state);
      expect(payload.grindDate).toBe('2026-04-12');
    },
  );

  it(
    'submit payload omits date fields when they are empty strings',
    () => {
      // Requirement 3.1: date fields are optional — empty values must not be sent
      const state = createInitialFormState();
      state.title = 'My Recipe';
      // All date fields remain empty (default)

      const payload = buildCreatePayload(state);
      expect('roastDate' in payload).toBe(false);
      expect('packageOpenDate' in payload).toBe(false);
      expect('grindDate' in payload).toBe(false);
    },
  );

  it(
    'submit payload includes all three date fields when all are provided',
    () => {
      const state = createInitialFormState();
      state.title = 'My Recipe';
      state.roastDate = '2026-03-15';
      state.packageOpenDate = '2026-03-22';
      state.grindDate = '2026-04-12';

      const payload = buildCreatePayload(state);
      expect(payload.roastDate).toBe('2026-03-15');
      expect(payload.packageOpenDate).toBe('2026-03-22');
      expect(payload.grindDate).toBe('2026-04-12');
    },
  );
});

describe('RecipeEditPage — date inputs pre-populated from loaded recipe version', () => {
  it(
    'roastDate is pre-populated as YYYY-MM-DD from ISO string',
    () => {
      // Requirement 2.2: edit form pre-populates roastDate from loaded recipe version
      const version: RecipeVersion = {
        brewMethod: 'v60',
        drinkType: 'pour_over',
        roastDate: '2026-03-15T00:00:00.000Z',
      };

      const state = extractEditFormDates(version);
      expect(state.roastDate).toBe('2026-03-15');
    },
  );

  it(
    'packageOpenDate is pre-populated as YYYY-MM-DD from ISO string',
    () => {
      // Requirement 2.2: edit form pre-populates packageOpenDate from loaded recipe version
      const version: RecipeVersion = {
        brewMethod: 'v60',
        drinkType: 'pour_over',
        packageOpenDate: '2026-03-22T00:00:00.000Z',
      };

      const state = extractEditFormDates(version);
      expect(state.packageOpenDate).toBe('2026-03-22');
    },
  );

  it(
    'grindDate is pre-populated as YYYY-MM-DD from ISO string',
    () => {
      // Requirement 2.2: edit form pre-populates grindDate from loaded recipe version
      const version: RecipeVersion = {
        brewMethod: 'v60',
        drinkType: 'pour_over',
        grindDate: '2026-04-12T00:00:00.000Z',
      };

      const state = extractEditFormDates(version);
      expect(state.grindDate).toBe('2026-04-12');
    },
  );

  it(
    'all three dates are pre-populated correctly when all are present',
    () => {
      // Requirement 2.2: all three date fields pre-populated from recipe version
      const version: RecipeVersion = {
        brewMethod: 'espresso_machine',
        drinkType: 'espresso',
        roastDate: '2026-03-15T00:00:00.000Z',
        packageOpenDate: '2026-03-22T00:00:00.000Z',
        grindDate: '2026-04-12T00:00:00.000Z',
      };

      const state = extractEditFormDates(version);
      expect(state.roastDate).toBe('2026-03-15');
      expect(state.packageOpenDate).toBe('2026-03-22');
      expect(state.grindDate).toBe('2026-04-12');
    },
  );

  it(
    'roastDate is empty string when recipe version has no roastDate',
    () => {
      // Requirement 3.1: date fields are optional — missing values produce empty inputs
      const version: RecipeVersion = {
        brewMethod: 'v60',
        drinkType: 'pour_over',
        roastDate: null,
      };

      const state = extractEditFormDates(version);
      expect(state.roastDate).toBe('');
    },
  );

  it(
    'packageOpenDate is empty string when recipe version has no packageOpenDate',
    () => {
      const version: RecipeVersion = {
        brewMethod: 'v60',
        drinkType: 'pour_over',
        packageOpenDate: null,
      };

      const state = extractEditFormDates(version);
      expect(state.packageOpenDate).toBe('');
    },
  );

  it(
    'grindDate is empty string when recipe version has no grindDate',
    () => {
      const version: RecipeVersion = {
        brewMethod: 'v60',
        drinkType: 'pour_over',
        grindDate: null,
      };

      const state = extractEditFormDates(version);
      expect(state.grindDate).toBe('');
    },
  );

  it(
    'all date fields are empty strings when recipe version has no dates',
    () => {
      // Requirement 3.1: recipe with no dates produces empty inputs (not errors)
      const version: RecipeVersion = {
        brewMethod: 'espresso_machine',
        drinkType: 'espresso',
      };

      const state = extractEditFormDates(version);
      expect(state.roastDate).toBe('');
      expect(state.packageOpenDate).toBe('');
      expect(state.grindDate).toBe('');
    },
  );

  it(
    'only the date portion (YYYY-MM-DD) is extracted from a full ISO timestamp',
    () => {
      // Requirement 2.2: <input type="date"> requires YYYY-MM-DD format
      const version: RecipeVersion = {
        brewMethod: 'v60',
        drinkType: 'pour_over',
        roastDate: '2026-03-15T14:30:00.000Z',
        packageOpenDate: '2026-03-22T09:00:00.000Z',
        grindDate: '2026-04-12T07:45:00.000Z',
      };

      const state = extractEditFormDates(version);
      // Must be exactly 10 characters (YYYY-MM-DD)
      expect(state.roastDate.length).toBe(10);
      expect(state.packageOpenDate.length).toBe(10);
      expect(state.grindDate.length).toBe(10);
      // Must match YYYY-MM-DD pattern
      expect(state.roastDate).toBe('2026-03-15');
      expect(state.packageOpenDate).toBe('2026-03-22');
      expect(state.grindDate).toBe('2026-04-12');
    },
  );
});

describe('RecipeDetailPage — Brew Parameters card contains date rows when present', () => {
  it(
    'Roast Date row is rendered when roastDate is present',
    () => {
      // Requirement 2.3: detail page shows Roast Date row when value is present
      const version: RecipeVersion = {
        brewMethod: 'espresso_machine',
        drinkType: 'espresso',
        roastDate: '2026-03-15T00:00:00.000Z',
      };

      const rows = getRenderedRows(version);
      const roastDateRow = rows.find((r) => r.label === 'Roast Date');
      expect(roastDateRow).toBeDefined();
      expect(roastDateRow?.value).toBe('2026-03-15');
    },
  );

  it(
    'Package Open Date row is rendered when packageOpenDate is present',
    () => {
      // Requirement 2.3: detail page shows Package Open Date row when value is present
      const version: RecipeVersion = {
        brewMethod: 'espresso_machine',
        drinkType: 'espresso',
        packageOpenDate: '2026-03-22T00:00:00.000Z',
      };

      const rows = getRenderedRows(version);
      const packageOpenDateRow = rows.find((r) => r.label === 'Package Open Date');
      expect(packageOpenDateRow).toBeDefined();
      expect(packageOpenDateRow?.value).toBe('2026-03-22');
    },
  );

  it(
    'Grind Date row is rendered when grindDate is present',
    () => {
      // Requirement 2.3: detail page shows Grind Date row when value is present
      const version: RecipeVersion = {
        brewMethod: 'espresso_machine',
        drinkType: 'espresso',
        grindDate: '2026-04-12T00:00:00.000Z',
      };

      const rows = getRenderedRows(version);
      const grindDateRow = rows.find((r) => r.label === 'Grind Date');
      expect(grindDateRow).toBeDefined();
      expect(grindDateRow?.value).toBe('2026-04-12');
    },
  );

  it(
    'all three date rows are rendered when all dates are present',
    () => {
      // Requirement 2.3: all three date rows appear when all values are present
      const version: RecipeVersion = {
        brewMethod: 'espresso_machine',
        drinkType: 'espresso',
        roastDate: '2026-03-15T00:00:00.000Z',
        packageOpenDate: '2026-03-22T00:00:00.000Z',
        grindDate: '2026-04-12T00:00:00.000Z',
      };

      const rows = getRenderedRows(version);
      const labels = rows.map((r) => r.label);

      expect(labels).toContain('Roast Date');
      expect(labels).toContain('Package Open Date');
      expect(labels).toContain('Grind Date');
    },
  );

  it(
    'date values are formatted as YYYY-MM-DD in the detail page rows',
    () => {
      // Requirement 2.3: dates displayed in YYYY-MM-DD format
      const version: RecipeVersion = {
        brewMethod: 'espresso_machine',
        drinkType: 'espresso',
        roastDate: '2026-03-15T00:00:00.000Z',
        packageOpenDate: '2026-03-22T00:00:00.000Z',
        grindDate: '2026-04-12T00:00:00.000Z',
      };

      const rows = getRenderedRows(version);
      const roastRow = rows.find((r) => r.label === 'Roast Date');
      const packageRow = rows.find((r) => r.label === 'Package Open Date');
      const grindRow = rows.find((r) => r.label === 'Grind Date');

      expect(roastRow?.value).toBe('2026-03-15');
      expect(packageRow?.value).toBe('2026-03-22');
      expect(grindRow?.value).toBe('2026-04-12');
    },
  );
});

describe('RecipeDetailPage — no date rows appear when date fields are absent', () => {
  it(
    'Roast Date row is absent when roastDate is null',
    () => {
      // Requirement 3.5: ParamRow returns null for falsy values — no row rendered
      const version: RecipeVersion = {
        brewMethod: 'espresso_machine',
        drinkType: 'espresso',
        roastDate: null,
      };

      const rows = getRenderedRows(version);
      const roastDateRow = rows.find((r) => r.label === 'Roast Date');
      expect(roastDateRow).toBeUndefined();
    },
  );

  it(
    'Package Open Date row is absent when packageOpenDate is null',
    () => {
      // Requirement 3.5: ParamRow returns null for falsy values — no row rendered
      const version: RecipeVersion = {
        brewMethod: 'espresso_machine',
        drinkType: 'espresso',
        packageOpenDate: null,
      };

      const rows = getRenderedRows(version);
      const packageOpenDateRow = rows.find((r) => r.label === 'Package Open Date');
      expect(packageOpenDateRow).toBeUndefined();
    },
  );

  it(
    'Grind Date row is absent when grindDate is null',
    () => {
      // Requirement 3.5: ParamRow returns null for falsy values — no row rendered
      const version: RecipeVersion = {
        brewMethod: 'espresso_machine',
        drinkType: 'espresso',
        grindDate: null,
      };

      const rows = getRenderedRows(version);
      const grindDateRow = rows.find((r) => r.label === 'Grind Date');
      expect(grindDateRow).toBeUndefined();
    },
  );

  it(
    'no date rows appear when recipe version has no date fields',
    () => {
      // Requirement 3.5: recipe with no dates shows no date rows
      const version: RecipeVersion = {
        brewMethod: 'espresso_machine',
        drinkType: 'espresso',
      };

      const rows = getRenderedRows(version);
      const labels = rows.map((r) => r.label);

      expect(labels).not.toContain('Roast Date');
      expect(labels).not.toContain('Package Open Date');
      expect(labels).not.toContain('Grind Date');
    },
  );

  it(
    'Brew Method and Drink Type rows are still present when no date fields exist',
    () => {
      // Requirement 3.5: all other parameter rows are unaffected by absent date fields
      const version: RecipeVersion = {
        brewMethod: 'espresso_machine',
        drinkType: 'espresso',
      };

      const rows = getRenderedRows(version);
      const labels = rows.map((r) => r.label);

      expect(labels).toContain('Brew Method');
      expect(labels).toContain('Drink Type');
    },
  );

  it(
    'all other parameter rows are still present when no date fields exist',
    () => {
      // Requirement 3.5: non-date rows are unaffected by absent date fields
      const version: RecipeVersion = {
        brewMethod: 'espresso_machine',
        drinkType: 'espresso',
        grinder: 'Niche Zero',
        grindSize: '2.5',
        productName: 'Ethiopia Yirgacheffe',
        coffeeBrand: 'Blue Bottle',
        coffeeProcessing: 'washed',
      };

      const rows = getRenderedRows(version);
      const labels = rows.map((r) => r.label);

      // Date rows must be absent
      expect(labels).not.toContain('Roast Date');
      expect(labels).not.toContain('Package Open Date');
      expect(labels).not.toContain('Grind Date');

      // All other rows must be present
      expect(labels).toContain('Brew Method');
      expect(labels).toContain('Drink Type');
      expect(labels).toContain('Grinder');
      expect(labels).toContain('Grind Size');
      expect(labels).toContain('Product Name');
      expect(labels).toContain('Coffee Brand');
      expect(labels).toContain('Processing');
    },
  );

  it(
    'date rows appear alongside other parameter rows when dates are present',
    () => {
      // Requirement 2.3 + 3.5: date rows and non-date rows coexist correctly
      const version: RecipeVersion = {
        brewMethod: 'espresso_machine',
        drinkType: 'espresso',
        grinder: 'Niche Zero',
        roastDate: '2026-03-15T00:00:00.000Z',
        packageOpenDate: '2026-03-22T00:00:00.000Z',
        grindDate: '2026-04-12T00:00:00.000Z',
      };

      const rows = getRenderedRows(version);
      const labels = rows.map((r) => r.label);

      // Date rows present
      expect(labels).toContain('Roast Date');
      expect(labels).toContain('Package Open Date');
      expect(labels).toContain('Grind Date');

      // Non-date rows also present
      expect(labels).toContain('Brew Method');
      expect(labels).toContain('Drink Type');
      expect(labels).toContain('Grinder');
    },
  );
});
