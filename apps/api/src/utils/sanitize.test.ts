import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { sanitizeName, sanitizeText } from './sanitize.ts';

/**
 * Unit tests for the server-side text sanitization utilities.
 *
 * `sanitizeText` and `sanitizeName` are security controls (regex-based stripping
 * used by `comment`, `recipe`, and `user` services). A regression — a tag or
 * attribute slipping through — would ship silently without this suite.
 *
 * The tests cover both dangerous-input neutralisation and benign-input
 * pass-through (regression baseline). Known limitations (no `javascript:` URL
 * filtering, no HTML entity decoding, `<` not followed by a letter) are
 * asserted as pass-through cases to lock the current behaviour as a baseline
 * — if a future change adds filtering, the test will fail and force a
 * conscious update.
 *
 * Follows the pure-utility convention: no `test-setup.ts`, no Hono app, no
 * spies, nested `describe` per function, `'should ...'` `it` naming.
 */

describe('sanitizeText', () => {
  it('should return empty string for null', () => {
    expect(sanitizeText(null)).toBe('');
  });

  it('should return empty string for undefined', () => {
    expect(sanitizeText(undefined)).toBe('');
  });

  it('should return empty string for empty string', () => {
    expect(sanitizeText('')).toBe('');
  });

  it('should strip script tags and preserve inner text', () => {
    expect(sanitizeText('<script>alert(1)</script>')).toBe('alert(1)');
  });

  it('should strip script tags with attributes', () => {
    expect(sanitizeText('<script src="x.js"></script>')).toBe('');
  });

  it('should strip closing tags', () => {
    expect(sanitizeText('</script>')).toBe('');
  });

  it('should strip image tags with onerror handlers', () => {
    expect(sanitizeText('<img src=x onerror=alert(1)>')).toBe('');
  });

  it('should strip anchor tags with onclick handlers and preserve inner text', () => {
    expect(sanitizeText('<a href="x" onclick="alert(1)">link</a>')).toBe('link');
  });

  it('should preserve numeric comparison expressions (the [a-z] anchor)', () => {
    expect(sanitizeText('1 < 2 > 1')).toBe('1 < 2 > 1');
  });

  it('should remove zero-width space (U+200B)', () => {
    expect(sanitizeText('hello\u200Bworld')).toBe('helloworld');
  });

  it('should remove zero-width non-joiner (U+200C)', () => {
    expect(sanitizeText('hello\u200Cworld')).toBe('helloworld');
  });

  it('should remove zero-width joiner (U+200D)', () => {
    expect(sanitizeText('hello\u200Dworld')).toBe('helloworld');
  });

  it('should remove BOM (U+FEFF)', () => {
    expect(sanitizeText('hello\uFEFFworld')).toBe('helloworld');
  });

  it('should remove soft hyphen (U+00AD)', () => {
    expect(sanitizeText('hello\u00ADworld')).toBe('helloworld');
  });

  it('should collapse runs of spaces/tabs to a single space', () => {
    expect(sanitizeText('a   b')).toBe('a b');
  });

  it('should preserve single newlines', () => {
    expect(sanitizeText('line1\nline2')).toBe('line1\nline2');
  });

  it('should collapse 3+ consecutive newlines to 2', () => {
    expect(sanitizeText('a\n\n\nb')).toBe('a\n\nb');
  });

  it('should trim leading and trailing whitespace', () => {
    expect(sanitizeText('  hello  ')).toBe('hello');
  });

  it('should pass plain text through unchanged', () => {
    expect(sanitizeText('hello world')).toBe('hello world');
  });

  it('should pass markdown bold/italic through unchanged', () => {
    expect(sanitizeText('**bold** _italic_')).toBe('**bold** _italic_');
  });

  // Documented limitations — asserted as pass-through to lock the regression
  // baseline. If a future change adds filtering here, these tests will fail
  // and force a conscious update.

  it('should pass javascript: URLs through unchanged (documented limitation)', () => {
    expect(sanitizeText('javascript:alert(1)')).toBe('javascript:alert(1)');
  });

  it('should pass HTML entity-encoded attacks through unchanged (documented limitation)', () => {
    expect(sanitizeText('&#60;script&#62;')).toBe('&#60;script&#62;');
  });

  it('should pass "<" not followed by a letter through unchanged (documented limitation)', () => {
    expect(sanitizeText('< script>')).toBe('< script>');
  });
});

describe('sanitizeName', () => {
  it('should collapse newlines to single spaces', () => {
    expect(sanitizeName('John\nDoe')).toBe('John Doe');
  });

  it('should collapse runs of whitespace to a single space', () => {
    expect(sanitizeName('John   Doe')).toBe('John Doe');
  });

  it('should strip HTML tags inherited from sanitizeText', () => {
    expect(sanitizeName('<script>John</script>')).toBe('John');
  });

  it('should return empty string for null', () => {
    expect(sanitizeName(null)).toBe('');
  });

  it('should trim leading and trailing whitespace', () => {
    expect(sanitizeName('  John  ')).toBe('John');
  });
});
