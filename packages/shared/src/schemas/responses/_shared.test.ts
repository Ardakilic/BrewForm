import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { AuthorRefSchema, MessageResponseSchema, RecipeAuthorMiniSchema } from './_shared.ts';

/** Normalize a payload to its JSON wire shape (Dates → ISO strings). */
function wire<T>(payload: T): unknown {
  return JSON.parse(JSON.stringify(payload));
}

describe('MessageResponseSchema', () => {
  it('parses a message-only payload and round-trips', () => {
    const payload = { message: 'Bean deleted' };
    const result = MessageResponseSchema.safeParse(wire(payload));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(payload);
  });
});

describe('AuthorRefSchema', () => {
  it('parses a populated author projection', () => {
    const payload = {
      id: 'u-1',
      username: 'barista',
      displayName: 'Barista',
      avatarUrl: 'https://cdn/x.png',
    };
    const result = AuthorRefSchema.safeParse(wire(payload));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(payload);
  });

  it('accepts null (leftJoin miss)', () => {
    expect(AuthorRefSchema.safeParse(null).success).toBe(true);
  });

  it('accepts null displayName/avatarUrl', () => {
    const payload = { id: 'u-1', username: 'barista', displayName: null, avatarUrl: null };
    expect(AuthorRefSchema.safeParse(wire(payload)).success).toBe(true);
  });
});

describe('RecipeAuthorMiniSchema', () => {
  it('parses the mini author projection and round-trips', () => {
    const payload = { username: 'barista', displayName: null, avatarUrl: null };
    const result = RecipeAuthorMiniSchema.safeParse(wire(payload));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(payload);
  });
});
