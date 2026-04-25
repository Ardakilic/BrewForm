export const EMOJI_TAGS = [
  { key: 'fire', emoji: '\u{1F525}', label: 'Amazing' },
  { key: 'rocket', emoji: '\u{1F680}', label: 'Super Good' },
  { key: 'thumbsup', emoji: '\u{1F44D}', label: 'Good' },
  { key: 'neutral', emoji: '\u{1F610}', label: 'Okay' },
  { key: 'thumbsdown', emoji: '\u{1F44E}', label: 'Bad' },
  { key: 'sick', emoji: '\u{1F922}', label: 'Horrible' },
] as const;

export type EmojiTagKey = (typeof EMOJI_TAGS)[number]['key'];