// deno-lint-ignore-file no-explicit-any require-await
import '../../test-setup.ts';
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { z } from 'zod';
import { jsonRequestBody } from './index.ts';

describe('jsonRequestBody', () => {
  it('should convert a Zod schema to a JSON Schema in an OpenAPI requestBody', () => {
    const result = jsonRequestBody(z.object({ name: z.string(), age: z.number().int() }));
    expect(result.content).toBeDefined();
    expect(result.content['application/json']).toBeDefined();
    expect(result.content['application/json'].schema).toBeDefined();
    const schema = result.content['application/json'].schema as Record<string, unknown>;
    expect(schema.type).toBe('object');
    expect(schema.properties).toBeDefined();
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    expect(properties.name).toBeDefined();
    expect(properties.name.type).toBe('string');
    expect(properties.age).toBeDefined();
    expect(properties.age.type).toBe('integer');
  });

  it('should default to the application/json media type', () => {
    const result = jsonRequestBody(z.object({ name: z.string() }));
    expect(result.content['application/json']).toBeDefined();
  });

  it('should include the description when one is provided', () => {
    const result = jsonRequestBody(z.object({ name: z.string() }), 'Create a user');
    expect(result.description).toBe('Create a user');
  });

  it('should omit description when none is provided', () => {
    const result = jsonRequestBody(z.object({ name: z.string() }));
    expect(result.description).toBeUndefined();
  });

  it('should support a custom media type', () => {
    const result = jsonRequestBody(z.object({ name: z.string() }), undefined, 'application/xml');
    expect(result.content['application/xml']).toBeDefined();
    expect(result.content['application/json']).toBeUndefined();
    const schema = result.content['application/xml'].schema as Record<string, unknown>;
    expect(schema.type).toBe('object');
  });

  it('should convert nested object schemas', () => {
    const result = jsonRequestBody(
      z.object({
        user: z.object({ id: z.string(), active: z.boolean() }),
        tags: z.array(z.string()),
      }),
    );
    const schema = result.content['application/json'].schema as Record<string, unknown>;
    expect(schema.type).toBe('object');
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    expect(properties.user.type).toBe('object');
    expect(properties.tags.type).toBe('array');
  });
});
