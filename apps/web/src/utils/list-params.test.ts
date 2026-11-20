import { describe, expect, it } from 'vitest';
import {
  isUuid,
  parsePageParam,
  readBoolean,
  readEnum,
  readPage,
  readText,
  readUuid,
  withParams,
} from './list-params.ts';

const UUID = '11111111-1111-4111-8111-111111111111';

describe('parsePageParam / readPage', () => {
  it('keeps a positive integer', () => {
    expect(parsePageParam('3')).toBe(3);
    expect(readPage(new URLSearchParams('page=4'))).toBe(4);
    expect(readPage(new URLSearchParams('collectionsPage=2'), 'collectionsPage')).toBe(2);
  });

  it.each([null, undefined, '', 'abc', '0', '-3'])('normalises %s to page 1', (raw) => {
    expect(parsePageParam(raw)).toBe(1);
  });
});

describe('readText', () => {
  it('trims and returns the value, or an empty string', () => {
    expect(readText(new URLSearchParams('q=%20ali%20'), 'q')).toBe('ali');
    expect(readText(new URLSearchParams(''), 'q')).toBe('');
  });

  it('falls back to legacy keys', () => {
    expect(readText(new URLSearchParams('search=gesha'), 'q', { legacyKeys: ['search'] })).toBe(
      'gesha',
    );
    expect(readText(new URLSearchParams('q=new&search=old'), 'q', { legacyKeys: ['search'] })).toBe(
      'new',
    );
  });

  it('truncates to maxLength', () => {
    expect(readText(new URLSearchParams('q=abcdef'), 'q', { maxLength: 3 })).toBe('abc');
  });
});

describe('readEnum / readUuid / readBoolean', () => {
  it('normalises unknown enum values to the fallback', () => {
    const allowed = ['a', 'b'] as const;
    expect(readEnum(new URLSearchParams('k=b'), 'k', allowed, 'a')).toBe('b');
    expect(readEnum(new URLSearchParams('k=zzz'), 'k', allowed, 'a')).toBe('a');
    expect(readEnum(new URLSearchParams(''), 'k', allowed, 'a')).toBe('a');
  });

  it('keeps only well-formed UUIDs', () => {
    expect(readUuid(new URLSearchParams(`id=${UUID}`), 'id')).toBe(UUID);
    expect(readUuid(new URLSearchParams('id=nope'), 'id')).toBe('');
    expect(isUuid(UUID)).toBe(true);
    expect(isUuid('x')).toBe(false);
  });

  it('reads only the literal true', () => {
    expect(readBoolean(new URLSearchParams('u=true'), 'u')).toBe(true);
    expect(readBoolean(new URLSearchParams('u=1'), 'u')).toBe(false);
    expect(readBoolean(new URLSearchParams(''), 'u')).toBe(false);
  });
});

describe('withParams', () => {
  it('sets values, joins arrays, removes empties and defaults without mutating the input', () => {
    const input = new URLSearchParams('a=1&b=2&sort=rating');
    const next = withParams(
      input,
      { a: 'x', b: '', ids: ['p', 'q'], flag: false, page: 3, sort: 'createdAt' },
      { sort: 'createdAt' },
    );
    expect(next.toString()).toBe('a=x&ids=p%2Cq&page=3');
    expect(input.toString()).toBe('a=1&b=2&sort=rating');
  });
});
