/**
 * Unit tests for the Markdown API reference renderer (`reference.ts`): tag grouping and section
 * order, row ordering, the auth marker, parameter rendering, response codes, determinism, and the
 * undocumented-route finder used by `apps/api/scripts/generate-api-reference.ts`.
 */
import { describe, expect, it } from 'vitest';
import {
  findUndocumentedRoutes,
  headingAnchor,
  type ReferenceDocument,
  renderApiReference,
  renderParameter,
  requiresAuth,
} from './reference.ts';

/** A small document covering declared, undeclared and missing tags, auth and parameters. */
function sampleDocument(): ReferenceDocument {
  return {
    info: { title: 'Demo API', version: '2.1.0' },
    tags: [
      { name: 'Recipes', description: 'Recipe CRUD | toggles' },
      { name: 'Brew Logs', description: 'Brew journal' },
      { name: 'Unused', description: 'Declared but never referenced' },
    ],
    paths: {
      '/api/v1/recipes/{id}': {
        delete: {
          tags: ['Recipes'],
          summary: 'Delete a recipe',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '404': {}, '204': {}, '401': {} },
        },
        get: {
          tags: ['Recipes'],
          summary: 'Get a recipe',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': {}, '404': {} },
        },
      },
      '/api/v1/recipes': {
        get: {
          tags: ['Recipes'],
          summary: 'List recipes',
          security: [],
          parameters: [
            { name: 'cursor', in: 'query', schema: { type: 'string' } },
            {
              name: 'sortBy',
              in: 'query',
              schema: { type: 'string', enum: ['createdAt', 'likeCount', 'rating'] },
            },
            { name: 'v1', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'ids', in: 'query', schema: { type: 'array', items: { type: 'string' } } },
          ],
          responses: { '200': {}, '503': {}, '400': {} },
        },
        post: {
          tags: ['Recipes', 'Brew Logs'],
          summary: 'Create a recipe',
          security: [{ bearerAuth: [] }],
          responses: { '201': {} },
        },
        parameters: [{ name: 'ignored', in: 'header' }],
      },
      '/api/v1/brew-logs': {
        get: { tags: ['Brew Logs'], summary: 'List brew logs', responses: { '200': {} } },
      },
      '/api/v1/zeta': {
        get: { tags: ['Zeta'], summary: 'Undeclared tag', responses: { '200': {} } },
      },
      '/api/v1/alpha': {
        get: { tags: ['Alpha'], summary: 'Another undeclared tag', responses: { '200': {} } },
      },
      '/health': { get: { summary: 'Liveness', responses: { '200': {} } } },
    },
  };
}

/** The table rows (lines starting with a backticked method) of one `## <section>` block. */
function rowsOf(markdown: string, section: string): string[] {
  const start = markdown.indexOf(`\n## ${section}\n`);
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = markdown.slice(start + 1);
  const next = rest.indexOf('\n## ', 1);
  const block = next < 0 ? rest : rest.slice(0, next);
  return block.split('\n').filter((line) => line.startsWith('| `'));
}

describe('renderApiReference', () => {
  it('renders the title, version, operation count and a contents list', () => {
    const md = renderApiReference(sampleDocument());
    expect(md.startsWith('# Demo API reference\n')).toBe(true);
    expect(md).toContain('Demo API 2.1.0: 8 operations in 5 sections.');
    expect(md).toContain('- [Recipes](#recipes) (4)\n');
    expect(md).toContain('- [Brew Logs](#brew-logs) (2)\n');
    expect(md.endsWith('\n')).toBe(true);
  });

  it('groups by tag: declared order, then undeclared alphabetically, then untagged; drops empty tags', () => {
    const md = renderApiReference(sampleDocument());
    const headings = md.split('\n').filter((line) => line.startsWith('## '));
    expect(headings).toEqual([
      '## Contents',
      '## Recipes',
      '## Brew Logs',
      '## Alpha',
      '## Zeta',
      '## Other',
    ]);
    // An operation with two tags is listed under both.
    expect(rowsOf(md, 'Brew Logs').map((row) => row.split(' | ')[1])).toEqual([
      '`/api/v1/brew-logs`',
      '`/api/v1/recipes`',
    ]);
    expect(rowsOf(md, 'Other')[0]).toContain('`/health`');
  });

  it('orders rows by path, then GET before POST before DELETE', () => {
    const rows = rowsOf(renderApiReference(sampleDocument()), 'Recipes');
    expect(rows.map((row) => row.split(' | ').slice(0, 2).join(' '))).toEqual([
      '| `GET` `/api/v1/recipes`',
      '| `POST` `/api/v1/recipes`',
      '| `GET` `/api/v1/recipes/{id}`',
      '| `DELETE` `/api/v1/recipes/{id}`',
    ]);
  });

  it('marks routes whose security requires credentials as Bearer and the rest as public', () => {
    const rows = rowsOf(renderApiReference(sampleDocument()), 'Recipes');
    const auth = rows.map((row) => row.split(' | ')[3]);
    // GET list has `security: []`, GET by id has no security, POST and DELETE require bearer.
    expect(auth).toEqual(['—', 'Bearer', '—', 'Bearer']);
  });

  it('renders parameters with location, required marker and type, escaping pipes', () => {
    const [listRow] = rowsOf(renderApiReference(sampleDocument()), 'Recipes');
    expect(listRow).toContain(
      [
        '`cursor` (query, string)',
        '`sortBy` (query, createdAt \\| likeCount \\| rating)',
        '`v1` (query, required, uuid)',
        '`ids` (query, string[])',
      ].join('<br>'),
    );
  });

  it('lists documented response codes in ascending order and escapes table text', () => {
    const md = renderApiReference(sampleDocument());
    const [listRow] = rowsOf(md, 'Recipes');
    expect(listRow.endsWith('| 200, 400, 503 |')).toBe(true);
    expect(rowsOf(md, 'Recipes')[3]?.endsWith('| 204, 401, 404 |')).toBe(true);
    expect(md).toContain('\nRecipe CRUD \\| toggles\n');
  });

  it('is deterministic regardless of key order in the document', () => {
    const doc = sampleDocument();
    const reversed: ReferenceDocument = {
      ...doc,
      paths: Object.fromEntries(
        Object.entries(doc.paths ?? {})
          .reverse()
          .map(([path, item]) => [path, Object.fromEntries(Object.entries(item).reverse())]),
      ),
    };
    expect(renderApiReference(reversed)).toBe(renderApiReference(doc));
  });
});

describe('renderParameter', () => {
  it('omits the required marker for path parameters and elides long enums', () => {
    expect(renderParameter({ name: 'slug', in: 'path', required: true })).toBe('`slug` (path)');
    const many = Array.from({ length: 10 }, (_, i) => `v${i}`);
    expect(renderParameter({ name: 'x', in: 'query', schema: { enum: many } })).toBe(
      '`x` (query, v0 | v1 | v2 | v3 | v4 | v5 | v6 | v7 | …)',
    );
  });
});

describe('requiresAuth', () => {
  it('needs a non-empty security requirement', () => {
    expect(requiresAuth({})).toBe(false);
    expect(requiresAuth({ security: [] })).toBe(false);
    expect(requiresAuth({ security: [{}] })).toBe(false);
    expect(requiresAuth({ security: [{ bearerAuth: [] }] })).toBe(true);
  });
});

describe('headingAnchor', () => {
  it('matches GitHub heading anchors', () => {
    expect(headingAnchor('Brew Logs')).toBe('brew-logs');
    expect(headingAnchor('QR Codes')).toBe('qr-codes');
  });
});

describe('findUndocumentedRoutes', () => {
  it('reports mounted routes missing from the document once, in OpenAPI path form', () => {
    const doc = sampleDocument();
    const missing = findUndocumentedRoutes(
      [
        { method: 'ALL', path: '/api/v1/*' },
        { method: 'GET', path: '/api/v1/recipes' },
        { method: 'GET', path: '/api/v1/recipes/:id' },
        { method: 'PATCH', path: '/api/v1/recipes/:id' },
        { method: 'PATCH', path: '/api/v1/recipes/:id' },
        { method: 'GET', path: '/uploads/:path{.+}' },
        { method: 'HEAD', path: '/api/v1/admin/users' },
        { method: 'GET', path: '/api/v1/openapi.json' },
        { method: 'GET', path: '/api/v1/docs' },
        { method: 'GET', path: '/api/v1/admin/users' },
      ],
      doc,
    );
    expect(missing).toEqual([
      'GET /api/v1/admin/users',
      'GET /uploads/{path}',
      'PATCH /api/v1/recipes/{id}',
    ]);
  });
});
