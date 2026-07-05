/** Builds a URL slug from a title: lowercases, strips non-word chars, hyphenates whitespace, collapses/trims hyphens, caps at 100 chars. */
export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

/** Returns the slug unchanged if unused, otherwise appends the first free numeric suffix ("-1", "-2", ...). */
export function ensureUniqueSlug(slug: string, existingSlugs: string[]): string {
  if (!existingSlugs.includes(slug)) return slug;
  let counter = 1;
  let candidate = `${slug}-${counter}`;
  while (existingSlugs.includes(candidate)) {
    counter++;
    candidate = `${slug}-${counter}`;
  }
  return candidate;
}
