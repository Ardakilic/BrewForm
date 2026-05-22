/**
 * Server-side text sanitization utilities.
 *
 * Uses simple regex-based stripping — no external dependencies.
 * This is intentionally NOT a full HTML sanitizer (we don't allow
 * any HTML in user content). All user-generated text fields should
 * be plain text or limited markdown (bold/italic only).
 */

/** Strip HTML-like tags from a string. Requires a letter after < or </ to avoid matching numeric comparisons like "1 < 2 > 1". */
function stripHtmlTags(text: string): string {
  return text.replace(/<\/?[a-z][^>]*>/gi, '');
}

/** Remove zero-width and other invisible Unicode characters */
function stripZeroWidthChars(text: string): string {
  return text.replace(/[\u200B\u200C\u200D\u200E\u200F\uFEFF\u00AD]/g, '');
}

/** Collapse runs of whitespace (preserving single newlines for markdown) */
function normalizeWhitespace(text: string): string {
  let result = text.replace(/[^\S\n]+/g, ' ');
  result = result.replace(/\n{3,}/g, '\n\n');
  return result.trim();
}

/**
 * Sanitize user-generated text content.
 *
 * Strips HTML tags, zero-width characters, and normalizes whitespace.
 * Returns the cleaned string, or empty string for null/undefined.
 */
export function sanitizeText(input: string | null | undefined): string {
  if (!input) return '';
  let text = input;
  text = stripHtmlTags(text);
  text = stripZeroWidthChars(text);
  text = normalizeWhitespace(text);
  return text;
}

/**
 * Sanitize a username or display name.
 *
 * Same as sanitizeText but also removes newlines entirely
 * (names should be single-line).
 */
export function sanitizeName(input: string | null | undefined): string {
  if (!input) return '';
  let text = sanitizeText(input);
  text = text.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return text;
}
