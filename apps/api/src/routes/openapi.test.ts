/**
 * Smoke test for the hono-openapi integration.
 *
 * Builds a tiny Hono app with a couple of describeRoute-decorated handlers
 * and verifies that openAPIRouteHandler returns a spec with a non-empty
 * `paths` map. Confirms the dependency is installed and wired correctly,
 * without requiring a database or a running server.
 */
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import { describeRoute, openAPIRouteHandler } from 'hono-openapi';

describe('OpenAPI integration', () => {
  it('produces a non-empty paths object from describeRoute decorations', async () => {
    const app = new Hono();

    app.get(
      '/sample',
      describeRoute({
        tags: ['Test'],
        summary: 'Sample endpoint',
        responses: { 200: { description: 'ok' } },
      }),
      (c) => c.json({ ok: true }),
    );

    app.post(
      '/sample',
      describeRoute({
        tags: ['Test'],
        summary: 'Sample POST endpoint',
        responses: { 201: { description: 'created' } },
      }),
      (c) => c.json({ ok: true }, 201),
    );

    const handler = openAPIRouteHandler(app, {
      documentation: {
        info: { title: 'Test API', version: '0.0.0' },
      },
    });

    app.get('/openapi.json', handler);

    const res = await app.request('/openapi.json');
    expect(res.status).toBe(200);

    const spec = await res.json() as {
      openapi?: string;
      paths?: Record<string, Record<string, unknown>>;
    };

    expect(typeof spec.openapi).toBe('string');
    expect(spec.paths).toBeDefined();
    const paths = spec.paths ?? {};
    expect(Object.keys(paths).length).toBeGreaterThan(0);
    expect(paths['/sample']).toBeDefined();
    expect(paths['/sample']?.get).toBeDefined();
    expect(paths['/sample']?.post).toBeDefined();
  });
});
