export const VISIBILITY_STATES = [
  { value: 'draft', label: 'Draft', description: 'Work in progress, not visible to anyone else' },
  { value: 'private', label: 'Private', description: 'Only visible to the owner' },
  { value: 'unlisted', label: 'Unlisted', description: 'Accessible via direct link only' },
  { value: 'public', label: 'Public', description: 'Visible to everyone, searchable, indexable' },
] as const;