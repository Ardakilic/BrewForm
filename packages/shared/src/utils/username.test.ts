import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { generateUniqueUsername } from './username.ts';

async function neverTaken(_username: string): Promise<boolean> {
  return false;
}

async function alwaysTaken(_username: string): Promise<boolean> {
  return true;
}

function makeTakenSet(set: Set<string>): (username: string) => Promise<boolean> {
  return async (username: string) => set.has(username);
}

describe('generateUniqueUsername', () => {
  it('should return base username when no conflict', async () => {
    const result = await generateUniqueUsername('coffeelover', neverTaken);
    expect(result).toBe('coffeelover');
  });

  it('should return base-1 when base is taken', async () => {
    const taken = new Set(['coffeelover']);
    const result = await generateUniqueUsername('coffeelover', makeTakenSet(taken));
    expect(result).toBe('coffeelover-1');
  });

  it('should return base-2 when base and base-1 are taken', async () => {
    const taken = new Set(['coffeelover', 'coffeelover-1']);
    const result = await generateUniqueUsername('coffeelover', makeTakenSet(taken));
    expect(result).toBe('coffeelover-2');
  });

  it('should return base-3 when base, base-1, base-2 are taken', async () => {
    const taken = new Set(['coffeelover', 'coffeelover-1', 'coffeelover-2']);
    const result = await generateUniqueUsername('coffeelover', makeTakenSet(taken));
    expect(result).toBe('coffeelover-3');
  });

  it('should handle empty base string', async () => {
    await expect(generateUniqueUsername('', neverTaken)).rejects.toThrow(
      'Cannot generate username from empty base',
    );
  });

  it('should handle base with special characters', async () => {
    const result = await generateUniqueUsername('user@name!', neverTaken);
    expect(result).toBe('username');
  });

  it('should handle very long base string', async () => {
    const long = 'a'.repeat(100);
    const result = await generateUniqueUsername(long, neverTaken);
    expect(result.length).toBeLessThanOrEqual(30);
  });

  it('should throw when all 100 attempts are taken', async () => {
    await expect(generateUniqueUsername('test', alwaysTaken)).rejects.toThrow(
      'Unable to generate unique username after 100 attempts',
    );
  });

  it('should handle mixed case by preserving case', async () => {
    const result = await generateUniqueUsername('CoffeeLover', neverTaken);
    expect(result).toBe('CoffeeLover');
  });
});
