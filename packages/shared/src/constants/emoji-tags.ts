/** Emoji reaction tags for quick recipe sentiment, ordered best to worst. */
export const EMOJI_TAGS = [
  { key: 'fire', emoji: '\u{1F525}', label: 'Amazing' },
  { key: 'rocket', emoji: '\u{1F680}', label: 'Super Good' },
  { key: 'thumbsup', emoji: '\u{1F44D}', label: 'Good' },
  { key: 'neutral', emoji: '\u{1F610}', label: 'Okay' },
  { key: 'thumbsdown', emoji: '\u{1F44E}', label: 'Bad' },
  { key: 'nauseated', emoji: '\u{1F922}', label: 'Horrible' },
] as const;

/** Union of valid emoji tag keys derived from {@link EMOJI_TAGS}. */
export type EmojiTagKey = (typeof EMOJI_TAGS)[number]['key'];

/** A single emoji tag option with value, emoji, and label. */
export type EmojiTagOption = {
  value: EmojiTagKey;
  emoji: string;
  label: string;
};

/** key is aliased to value for consistent option pattern */
export const EMOJI_TAGS_LIST: EmojiTagOption[] = EMOJI_TAGS.map((t) => ({
  value: t.key,
  emoji: t.emoji,
  label: t.label,
}));

/**
 * Pure-values tuple of every {@link EmojiTagKey}.
 *
 * Derived from {@link EMOJI_TAGS} via `.map()` (the source field is `key`,
 * not `value`). Consumed by Drizzle's `pgEnum()` and by Zod `z.enum()` to keep
 * the database enum, runtime validation, and TypeScript union synchronised.
 */
export const EMOJI_TAG_VALUES = EMOJI_TAGS.map((t) => t.key) as [EmojiTagKey, ...EmojiTagKey[]];
