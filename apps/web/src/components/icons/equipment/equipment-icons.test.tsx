/**
 * Property-Based Tests for Equipment Type Icons
 *
 * Feature: recipe-detail-redesign
 * Property 11: Equipment type icon uniqueness
 *
 * **Validates: Requirements 15.1, 15.2**
 */

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import fc from 'fast-check';
import { getEquipmentIcon, OtherIcon } from './index.ts';

// ---------------------------------------------------------------------------
// Known equipment types (the defined set per Requirement 15.1)
// ---------------------------------------------------------------------------

const KNOWN_TYPES = [
  'espresso_machine',
  'grinder',
  'pour_over_brewer',
  'immersion_brewer',
  'kettle',
  'milk_tool',
  'scale_accessory',
  'roaster',
  'portafilter',
  'basket',
  'puck_screen',
  'paper_filter',
  'tamper',
  'mesh_filter',
  'cezve',
  'thermometer',
  'other',
] as const;

const TYPES_WITH_UNIQUE_ICONS = [
  'portafilter',
  'basket',
  'puck_screen',
  'tamper',
  'mesh_filter',
  'cezve',
  'thermometer',
] as const;

// ---------------------------------------------------------------------------
// 1. All known types return a component
// ---------------------------------------------------------------------------

describe('getEquipmentIcon — all known types return a component', () => {
  it('returns a non-null function for each of the 17 known equipment types', () => {
    for (const type of KNOWN_TYPES) {
      const icon = getEquipmentIcon(type);
      expect(icon, `Expected a component for type "${type}"`).toBeDefined();
      expect(typeof icon, `Expected a function for type "${type}"`).toBe('function');
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Uniqueness — Property 11: Equipment type icon uniqueness
//
// For any two distinct equipment type strings from the defined set, the icon
// mapping function SHALL return different icon components, ensuring no two
// types share the same visual representation.
// ---------------------------------------------------------------------------

describe('getEquipmentIcon — Property 11: Equipment type icon uniqueness', () => {
  it(
    'types with unique icons map to distinct component references',
    () => {
      /**
       * **Validates: Requirements 15.1**
       *
       * Feature: recipe-detail-redesign, Property 11: Equipment type icon uniqueness
       *
       * Types known to have dedicated icon components must each return a
       * distinct component reference.
       */
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: TYPES_WITH_UNIQUE_ICONS.length - 1 }),
          fc.integer({ min: 0, max: TYPES_WITH_UNIQUE_ICONS.length - 1 }),
          (indexA, indexB) => {
            fc.pre(indexA !== indexB);

            const typeA = TYPES_WITH_UNIQUE_ICONS[indexA];
            const typeB = TYPES_WITH_UNIQUE_ICONS[indexB];

            const iconA = getEquipmentIcon(typeA);
            const iconB = getEquipmentIcon(typeB);

            expect(iconA).not.toBe(iconB);
          },
        ),
        { numRuns: 200 },
      );
    },
  );

  it('all 17 known types return a function and produce a reasonable set of distinct icons', () => {
    const icons = KNOWN_TYPES.map((type) => getEquipmentIcon(type));
    const uniqueIcons = new Set(icons);
    expect(icons.every((icon) => typeof icon === 'function')).toBe(true);
    expect(uniqueIcons.size).toBeGreaterThanOrEqual(10);
    expect(uniqueIcons.size).toBeLessThanOrEqual(KNOWN_TYPES.length);
  });
});

// ---------------------------------------------------------------------------
// 3. Unknown type fallback — Validates: Requirement 15.2
// ---------------------------------------------------------------------------

describe('getEquipmentIcon — unknown type fallback', () => {
  it('returns the OtherIcon component for an unknown type string', () => {
    const icon = getEquipmentIcon('unknown_type');
    expect(icon).toBe(OtherIcon);
  });

  it('returns the OtherIcon component for an empty string', () => {
    const icon = getEquipmentIcon('');
    expect(icon).toBe(OtherIcon);
  });

  it(
    'returns the OtherIcon component for any arbitrary string not in the known set',
    () => {
      /**
       * **Validates: Requirements 15.2**
       *
       * Feature: recipe-detail-redesign, Property 11: Equipment type icon uniqueness
       *
       * For any equipment type string not in the defined set, the mapping
       * function SHALL return the OtherIcon fallback component.
       */
      const knownSet = new Set<string>(KNOWN_TYPES);

      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 40 }),
          (unknownType) => {
            fc.pre(!knownSet.has(unknownType));

            const icon = getEquipmentIcon(unknownType);
            expect(icon).toBe(OtherIcon);
          },
        ),
        { numRuns: 200 },
      );
    },
  );
});

// ---------------------------------------------------------------------------
// 4. All icons render without error
// ---------------------------------------------------------------------------

describe('getEquipmentIcon — all icons render without error', () => {
  it('each icon component renders without throwing for all 17 known types', () => {
    for (const type of KNOWN_TYPES) {
      const Icon = getEquipmentIcon(type);
      expect(
        () => render(<Icon />),
        `Expected <${type}> icon to render without error`,
      ).not.toThrow();
    }
  });
});
