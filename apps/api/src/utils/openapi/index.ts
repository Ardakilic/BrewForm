// deno-lint-ignore-file no-explicit-any
import { z } from 'zod';

/**
 * Builds an inline OpenAPI `requestBody` object from a Zod schema.
 *
 * `hono-openapi` v1 only converts `resolver()` schemas that appear under a
 * route's `responses` (see `resolveResponseSchemas`); resolvers placed under
 * `requestBody` are neither processed at spec-generation time nor accepted by
 * the `requestBody` types. To document request bodies without switching the
 * validation middleware (ADR-012 keeps `@hono/zod-validator`'s `zValidator`),
 * we synchronously convert the same Zod schema to a JSON Schema object and embed
 * it directly. This is documentation-only and never affects runtime behavior.
 *
 * @param schema The Zod schema validated by `zValidator` for this body.
 * @param description Optional human-readable request-body description.
 * @param mediaType Defaults to `application/json`.
 */
export function jsonRequestBody(
  schema: z.ZodType,
  description?: string,
  mediaType = 'application/json',
) {
  return {
    ...(description ? { description } : {}),
    content: {
      [mediaType]: {
        // hono-openapi v1.3.0's requestBody content schema type doesn't accept zod-openapi's JSON Schema output; cast required (D34 P3).
        schema: z.toJSONSchema(schema, { unrepresentable: 'any' }) as any,
      },
    },
  };
}
