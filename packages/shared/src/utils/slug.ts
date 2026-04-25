export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

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