/**
 * Enum single-source-of-truth tests.
 *
 * Verifies that every `_VALUES` tuple in `packages/shared/src/constants/`
 * matches the underlying rich-object definition. These are the runtime guard
 * for the contract that the database enum, the Zod schema, and the
 * TypeScript union all derive from the same source of truth.
 *
 * If a future refactor adds a new value to e.g. `BREW_METHODS` but forgets
 * to also add it to a `_VALUES` tuple, this test fails immediately.
 */
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { BADGE_RULE_VALUES, BADGE_RULES } from './badges.ts';
import { BREW_METHOD_VALUES, BREW_METHODS } from './brew-methods.ts';
import { DRINK_TYPE_VALUES, DRINK_TYPES } from './drink-types.ts';
import { EMOJI_TAG_VALUES, EMOJI_TAGS } from './emoji-tags.ts';
import {
  ADDITIONAL_PREPARATION_TYPE_VALUES,
  type AdditionalPreparationCategory,
} from './additional-preparation-types.ts';
import { COFFEE_VARIETY_CATEGORY_VALUES, type CoffeeVarietyCategory } from './coffee-variety.ts';
import {
  EQUIPMENT_DELETE_REQUEST_STATUS_VALUES,
  type EquipmentDeleteRequestStatus,
} from './equipment-delete-request.ts';
import { REPORT_STATUS_VALUES, type ReportStatus } from './report-status.ts';
import {
  EQUIPMENT_TYPE_LABELS,
  EQUIPMENT_TYPE_VALUES,
  EQUIPMENT_TYPES,
  type EquipmentType,
} from './equipment-types.ts';
import {
  DATE_FORMAT_DISPLAY,
  DATE_FORMAT_VALUES,
  TEMPERATURE_UNIT_VALUES,
  THEME_VALUES,
  UNIT_SYSTEM_VALUES,
} from './user-preferences.ts';
import { VISIBILITY_STATES, VISIBILITY_VALUES } from './visibility.ts';

describe('Enum single-source-of-truth: _VALUES tuples match rich objects', () => {
  it('VISIBILITY_VALUES matches VISIBILITY_STATES', () => {
    expect([...VISIBILITY_VALUES].sort())
      .toEqual(VISIBILITY_STATES.map((s) => s.value).sort());
  });

  it('BREW_METHOD_VALUES matches BREW_METHODS', () => {
    expect([...BREW_METHOD_VALUES].sort())
      .toEqual(BREW_METHODS.map((m) => m.value).sort());
  });

  it('DRINK_TYPE_VALUES matches DRINK_TYPES', () => {
    expect([...DRINK_TYPE_VALUES].sort())
      .toEqual(DRINK_TYPES.map((d) => d.value).sort());
  });

  it('EMOJI_TAG_VALUES matches EMOJI_TAGS keys', () => {
    expect([...EMOJI_TAG_VALUES].sort())
      .toEqual(EMOJI_TAGS.map((t) => t.key).sort());
  });

  it('BADGE_RULE_VALUES matches BADGE_RULES rules', () => {
    expect([...BADGE_RULE_VALUES].sort())
      .toEqual(BADGE_RULES.map((b) => b.rule).sort());
  });
});

describe('Standalone enum constants: types derived from values', () => {
  it('EquipmentType covers every value in EQUIPMENT_TYPE_VALUES', () => {
    const typeSet: Set<EquipmentType> = new Set(EQUIPMENT_TYPE_VALUES);
    expect(typeSet.size).toBe(EQUIPMENT_TYPE_VALUES.length);
    for (const value of EQUIPMENT_TYPE_VALUES) {
      expect(typeSet.has(value)).toBe(true);
    }
  });

  it('EQUIPMENT_TYPES is a readonly copy of EQUIPMENT_TYPE_VALUES', () => {
    expect(EQUIPMENT_TYPES.length).toBe(EQUIPMENT_TYPE_VALUES.length);
    expect([...EQUIPMENT_TYPES].sort()).toEqual([...EQUIPMENT_TYPE_VALUES].sort());
  });

  it('EQUIPMENT_TYPE_LABELS has an entry for every EquipmentType', () => {
    for (const type of EQUIPMENT_TYPE_VALUES) {
      const label = EQUIPMENT_TYPE_LABELS[type];
      expect(label).toBeDefined();
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('AdditionalPreparationCategory covers ADDITIONAL_PREPARATION_TYPE_VALUES', () => {
    const set: Set<AdditionalPreparationCategory> = new Set(
      ADDITIONAL_PREPARATION_TYPE_VALUES,
    );
    expect(set.size).toBe(ADDITIONAL_PREPARATION_TYPE_VALUES.length);
  });

  it('CoffeeVarietyCategory covers COFFEE_VARIETY_CATEGORY_VALUES', () => {
    const set: Set<CoffeeVarietyCategory> = new Set(COFFEE_VARIETY_CATEGORY_VALUES);
    expect(set.size).toBe(COFFEE_VARIETY_CATEGORY_VALUES.length);
  });

  it('EquipmentDeleteRequestStatus covers its values', () => {
    const set: Set<EquipmentDeleteRequestStatus> = new Set(
      EQUIPMENT_DELETE_REQUEST_STATUS_VALUES,
    );
    expect(set.size).toBe(EQUIPMENT_DELETE_REQUEST_STATUS_VALUES.length);
  });

  it('ReportStatus covers every REPORT_STATUS_VALUES entry', () => {
    const set: Set<ReportStatus> = new Set(REPORT_STATUS_VALUES);
    expect(set.size).toBe(REPORT_STATUS_VALUES.length);
    for (const value of REPORT_STATUS_VALUES) {
      expect(set.has(value)).toBe(true);
    }
  });
});

describe('User preference constants', () => {
  it('DATE_FORMAT_VALUES uses underscores (matches PostgreSQL enum)', () => {
    for (const value of DATE_FORMAT_VALUES) {
      expect(value).not.toContain('/');
      expect(value).toMatch(/^[A-Z_]+$/);
    }
  });

  it('DATE_FORMAT_DISPLAY covers every DATE_FORMAT_VALUES entry', () => {
    for (const value of DATE_FORMAT_VALUES) {
      const display = DATE_FORMAT_DISPLAY[value];
      expect(display).toBeDefined();
      expect(display).not.toBe(value);
    }
  });

  it('UNIT_SYSTEM_VALUES contains metric and imperial', () => {
    expect(new Set(UNIT_SYSTEM_VALUES)).toEqual(new Set(['metric', 'imperial']));
  });

  it('TEMPERATURE_UNIT_VALUES contains celsius and fahrenheit', () => {
    expect(new Set(TEMPERATURE_UNIT_VALUES)).toEqual(new Set(['celsius', 'fahrenheit']));
  });

  it('THEME_VALUES contains light, dark, coffee', () => {
    expect(new Set(THEME_VALUES)).toEqual(new Set(['light', 'dark', 'coffee']));
  });
});
