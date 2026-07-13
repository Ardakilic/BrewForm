import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import fc from 'npm:fast-check';
import { MAX_MENTIONS, parseMentions } from './mention.ts';

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,30}$/;

describe('parseMentions', () => {
  it('extracts a simple mention', () => {
    expect(parseMentions('hello @alice')).toEqual(['alice']);
  });

  it('extracts a mention at the start of the string', () => {
    expect(parseMentions('@alice hi there')).toEqual(['alice']);
  });

  it('extracts a mention after whitespace or punctuation', () => {
    expect(parseMentions('thanks, @alice!')).toEqual(['alice']);
    expect(parseMentions('(cc @bob_dev)')).toEqual(['bob_dev']);
    expect(parseMentions('see:@charlie.')).toEqual(['charlie']);
  });

  it('supports hyphen and underscore usernames', () => {
    expect(parseMentions('@a-user and @b_user')).toEqual(['a-user', 'b_user']);
  });

  it('does NOT match email-like text (preceding alphanumeric)', () => {
    expect(parseMentions('reach me at bob@gmail')).toEqual([]);
    expect(parseMentions('a@bcd')).toEqual([]);
    expect(parseMentions('user123@example')).toEqual([]);
  });

  it('does NOT match usernames shorter than 3 chars', () => {
    expect(parseMentions('@ab')).toEqual([]);
    expect(parseMentions('hi @a there')).toEqual([]);
    expect(parseMentions('@xy!')).toEqual([]);
  });

  it('does NOT truncate-match a token longer than 30 chars', () => {
    const long = 'a'.repeat(31);
    // The over-length run yields no match at all (not a 30-char prefix).
    expect(parseMentions(`@${long}`)).toEqual([]);
    // Exactly 30 chars is still valid.
    const exact = 'b'.repeat(30);
    expect(parseMentions(`@${exact}`)).toEqual([exact]);
    // 31-char run followed by a boundary still yields no match.
    expect(parseMentions(`@${long} end`)).toEqual([]);
  });

  it('extracts adjacent (space-separated) mentions', () => {
    expect(parseMentions('@a-user @b-user')).toEqual(['a-user', 'b-user']);
    expect(parseMentions('@alice @bob @carol')).toEqual(['alice', 'bob', 'carol']);
  });

  it('deduplicates repeated mentions, preserving first-seen order', () => {
    expect(parseMentions('@alice @bob @alice @carol @bob')).toEqual(['alice', 'bob', 'carol']);
  });

  it('caps the number of unique mentions at MAX_MENTIONS', () => {
    const many = Array.from({ length: 15 }, (_, i) => `@user${i}0`).join(' ');
    const result = parseMentions(many);
    expect(result.length).toBe(MAX_MENTIONS);
    expect(result[0]).toBe('user00');
  });

  it('preserves case (resolution is exact-match)', () => {
    expect(parseMentions('@Alice @BOB @cD3')).toEqual(['Alice', 'BOB', 'cD3']);
  });

  it('does NOT match a lone @ or @ with no username', () => {
    expect(parseMentions('@')).toEqual([]);
    expect(parseMentions('email @ me')).toEqual([]);
    expect(parseMentions('what @ 3pm')).toEqual([]);
  });

  it('extracts mentions surrounded by unicode text', () => {
    expect(parseMentions('héllo @alice wörld 🎉 @bob')).toEqual(['alice', 'bob']);
    // A non-ASCII char immediately before @ counts as a boundary.
    expect(parseMentions('日本語@charlie')).toEqual(['charlie']);
  });

  it('returns an empty array for text with no mentions', () => {
    expect(parseMentions('just a plain comment.')).toEqual([]);
    expect(parseMentions('')).toEqual([]);
  });
});

describe('parseMentions — properties', () => {
  it('always returns at most MAX_MENTIONS unique usernames', () => {
    fc.assert(
      fc.property(fc.string(), (content) => {
        const result = parseMentions(content);
        expect(result.length).toBeLessThanOrEqual(MAX_MENTIONS);
        expect(new Set(result).size).toBe(result.length);
      }),
    );
  });

  it('every returned username matches the username regex', () => {
    fc.assert(
      fc.property(fc.string(), (content) => {
        for (const username of parseMentions(content)) {
          expect(USERNAME_RE.test(username)).toBe(true);
        }
      }),
    );
  });
});
