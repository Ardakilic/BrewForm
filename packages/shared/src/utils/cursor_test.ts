import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { decodeCursor, encodeCursor } from './cursor.ts';

describe('encodeCursor / decodeCursor', () => {
  it('round-trips a valid cursor', () => {
    const cursor = {
      createdAt: '2026-05-29T10:30:00.000Z',
      id: 'abc-123',
    };
    const encoded = encodeCursor(cursor);
    expect(typeof encoded).toBe('string');
    expect(encoded).not.toContain('{');
    expect(decodeCursor(encoded)).toEqual(cursor);
  });

  it('throws on empty string', () => {
    expect(() => decodeCursor('')).toThrow('Invalid cursor format');
  });

  it('throws on tampered base64', () => {
    expect(() => decodeCursor('not-valid-base64!')).toThrow('Invalid cursor format');
  });

  it('throws on invalid JSON after base64 decode', () => {
    const encoded = btoa('this is not json');
    expect(() => decodeCursor(encoded)).toThrow('Invalid cursor format');
  });

  it('throws when createdAt is missing', () => {
    const encoded = btoa(JSON.stringify({ id: 'abc-123' }));
    expect(() => decodeCursor(encoded)).toThrow('Invalid cursor format');
  });

  it('throws when id is missing', () => {
    const encoded = btoa(JSON.stringify({ createdAt: '2026-05-29T10:30:00.000Z' }));
    expect(() => decodeCursor(encoded)).toThrow('Invalid cursor format');
  });

  it('throws when fields have wrong types', () => {
    const encoded = btoa(JSON.stringify({ createdAt: 123, id: 456 }));
    expect(() => decodeCursor(encoded)).toThrow('Invalid cursor format');
  });

  it('throws on non-string input', () => {
    expect(() => decodeCursor(null as unknown as string)).toThrow('Invalid cursor format');
  });
});
