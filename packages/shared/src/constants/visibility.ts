export const VISIBILITY_STATES = [
  { value: 'draft', label: 'Draft', description: 'Work in progress, not visible to anyone else' },
  { value: 'private', label: 'Private', description: 'Only visible to the owner' },
  { value: 'unlisted', label: 'Unlisted', description: 'Accessible via direct link only' },
  { value: 'public', label: 'Public', description: 'Visible to everyone, searchable, indexable' },
] as const;

export type VisibilityValue = (typeof VISIBILITY_STATES)[number]['value'];

export type VisibilityOption = {
  value: VisibilityValue;
  label: string;
  description: string;
};

export const VISIBILITY_STATES_LIST: VisibilityOption[] = [...VISIBILITY_STATES];

/**
 * Pure-values tuple of every {@link VisibilityValue}.
 *
 * Derived from {@link VISIBILITY_STATES} via `.map()` so the two cannot drift
 * apart. Consumed by Drizzle's `pgEnum()` and by Zod `z.enum()` so the runtime
 * validation set, the database enum, and the TypeScript union share one source
 * of truth.
 */
export const VISIBILITY_VALUES = VISIBILITY_STATES.map((s) => s.value) as [
  VisibilityValue,
  ...VisibilityValue[],
];
