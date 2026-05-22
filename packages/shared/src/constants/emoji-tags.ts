export const EMOJI_TAGS = [
  { key: 'fire', emoji: '\u{1F525}', label: 'Amazing' },
  { key: 'rocket', emoji: '\u{1F680}', label: 'Super Good' },
  { key: 'thumbsup', emoji: '\u{1F44D}', label: 'Good' },
  { key: 'neutral', emoji: '\u{1F610}', label: 'Okay' },
  { key: 'thumbsdown', emoji: '\u{1F44E}', label: 'Bad' },
  { key: 'nauseated', emoji: '\u{1F922}', label: 'Horrible' },
] as const;

export type EmojiTagKey = (typeof EMOJI_TAGS)[number]['key'];

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
