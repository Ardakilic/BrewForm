/**
 * Introspection-based OpenAPI coverage test (Coverage_Test).
 *
 * Builds the REAL aggregated router from `routes/index.ts`, requests the
 * generated `/api/v1/openapi.json` document, and exhaustively asserts the
 * structural correctness properties of the spec.
 *
 * This realizes design Properties 1–7 by iterating the full `paths` map of the
 * generated spec (exhaustive verification, not sampling) plus the non-JSON
 * content-type requirements (9.x) and the preserved auth/recipe/admin/health
 * coverage (Requirement 2).
 *
 * Feasibility (Requirement 10.10): `postgres-js` connects lazily and the cache
 * singleton uses in-memory mode when `CACHE_DRIVER=memory`, so importing the
 * router and generating the spec performs no DB/KV I/O. Env is set before the
 * dynamic import so the config singleton loads with the documented test values.
 *
 * The pre-existing `routes/openapi.test.ts` smoke test is left unchanged.
 */
import { beforeAll, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';

// ---------------------------------------------------------------------------
// Test environment — set BEFORE the dynamic import of the router so the
// config singleton (loaded at module-eval time) sees these values. No DB/KV
// connection occurs during spec generation.
// ---------------------------------------------------------------------------
Deno.env.set('OPENAPI_ENABLED', 'true');
Deno.env.set('APP_ENV', 'test');
Deno.env.set('CACHE_DRIVER', 'memory');
if (!Deno.env.get('DATABASE_URL')) {
  Deno.env.set('DATABASE_URL', 'postgresql://test:test@localhost:5432/test');
}
if (!Deno.env.get('JWT_SECRET')) {
  Deno.env.set('JWT_SECRET', 'a-very-long-secret-key-for-testing-12345');
}

// ---------------------------------------------------------------------------
// Spec shape (loose typing — we only read the parts we assert against).
// ---------------------------------------------------------------------------
type AnyObj = Record<string, unknown>;
interface Operation {
  tags?: string[];
  summary?: string;
  security?: unknown[];
  parameters?: AnyObj[];
  requestBody?: { content?: Record<string, { schema?: unknown }> };
  responses?: Record<string, { content?: Record<string, { schema?: unknown }> }>;
}
interface OpenApiSpec {
  openapi?: string;
  paths?: Record<string, Record<string, Operation>>;
  tags?: Array<{ name: string; description?: string }>;
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'];

/** The 19 in-scope base paths (matched by prefix). */
const IN_SCOPE_BASE_PATHS = [
  '/api/v1/beans',
  '/api/v1/badges',
  '/api/v1/brew-logs',
  '/api/v1/coffee-varieties',
  '/api/v1/collections',
  '/api/v1/comments',
  '/api/v1/contact',
  '/api/v1/equipment',
  '/api/v1/follow',
  '/api/v1/notifications',
  '/api/v1/photos',
  '/api/v1/preferences',
  '/api/v1/qrcode',
  '/api/v1/reports',
  '/api/v1/setups',
  '/api/v1/taste-notes',
  '/api/v1/users',
  '/api/v1/vendors',
  '/share',
  '/api/v1/sitemap.xml',
];

interface OpEntry {
  path: string;
  method: string;
  op: Operation;
}

let spec: OpenApiSpec;
let allOps: OpEntry[];
let declaredTags: Set<string>;

function isNonEmptyObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    Object.keys(value as AnyObj).length > 0;
}

/** A resolved schema is a non-empty object that is not the unresolved zod stub. */
function isResolvedSchema(value: unknown): boolean {
  if (!isNonEmptyObject(value)) return false;
  const keys = Object.keys(value as AnyObj);
  if (keys.length === 1 && (value as AnyObj).vendor === 'zod') return false;
  return true;
}

/** True when an operation path belongs to one of the 19 in-scope groups. */
function isInScope(path: string): boolean {
  return IN_SCOPE_BASE_PATHS.some(
    (base) => path === base || path.startsWith(base + '/'),
  );
}

beforeAll(async () => {
  // Dynamic import AFTER env is set so the config singleton picks up the values.
  const { default: routes } = await import('./index.ts');
  const res = await routes.request('/api/v1/openapi.json');
  expect(res.status).toBe(200);
  spec = (await res.json()) as OpenApiSpec;

  const paths = spec.paths ?? {};
  allOps = [];
  for (const [path, item] of Object.entries(paths)) {
    for (const [method, op] of Object.entries(item)) {
      if (HTTP_METHODS.includes(method.toLowerCase())) {
        allOps.push({ path, method: method.toLowerCase(), op: op as Operation });
      }
    }
  }
  declaredTags = new Set((spec.tags ?? []).map((t) => t.name));
});

describe('OpenAPI coverage — generated spec is well-formed', () => {
  it('produces a valid OpenAPI document with a non-empty paths map', () => {
    expect(typeof spec.openapi).toBe('string');
    expect(Object.keys(spec.paths ?? {}).length).toBeGreaterThan(0);
    expect(allOps.length).toBeGreaterThan(0);
  });

  // Property 1 — coverage of all in-scope routes.
  it('documents all 19 in-scope base paths (P1)', () => {
    const pathKeys = Object.keys(spec.paths ?? {});
    const missing = IN_SCOPE_BASE_PATHS.filter(
      (base) => !pathKeys.some((p) => p === base || p.startsWith(base + '/')),
    );
    expect(missing).toEqual([]);
  });

  // Property 7 — every operation is tagged.
  it('every operation declares at least one tag (P7)', () => {
    const untagged = allOps
      .filter(({ op }) => !Array.isArray(op.tags) || op.tags.length === 0)
      .map(({ path, method }) => `${method.toUpperCase()} ${path}`);
    expect(untagged).toEqual([]);
  });

  // Property 7 — zero orphan tags (referenced ⊆ declared).
  it('every referenced tag is declared in the Tag_Registry — zero orphans (P7)', () => {
    const referenced = new Set<string>();
    for (const { op } of allOps) {
      for (const tag of op.tags ?? []) referenced.add(tag);
    }
    const orphans = [...referenced].filter((t) => !declaredTags.has(t));
    expect(orphans).toEqual([]);
  });

  // Property 5 — every operation declares ≥1 response keyed 100–599.
  it('every operation declares at least one response keyed 100–599 (P5)', () => {
    const offenders: string[] = [];
    for (const { path, method, op } of allOps) {
      const codes = Object.keys(op.responses ?? {});
      const hasValid = codes.some((code) => {
        const n = Number(code);
        return Number.isInteger(n) && n >= 100 && n <= 599;
      });
      if (!hasValid) offenders.push(`${method.toUpperCase()} ${path}`);
    }
    expect(offenders).toEqual([]);
  });

  // Property 4 — every auth-guarded in-scope op documents 401.
  it('every auth-guarded in-scope operation documents a 401 response (P4)', () => {
    const missing401: string[] = [];
    for (const { path, method, op } of allOps) {
      if (!isInScope(path)) continue;
      const guarded = Array.isArray(op.security) && op.security.length > 0;
      if (guarded && !(op.responses && op.responses['401'])) {
        missing401.push(`${method.toUpperCase()} ${path}`);
      }
    }
    expect(missing401).toEqual([]);
  });

  // Property 2 — at least one op documents a requestBody JSON schema.
  it('at least one operation declares a non-empty requestBody JSON schema (P2)', () => {
    const withRequestBody = allOps.filter(({ op }) => {
      const schema = op.requestBody?.content?.['application/json']?.schema;
      return isNonEmptyObject(schema);
    });
    expect(withRequestBody.length).toBeGreaterThan(0);
  });

  // Property 3 — at least one op documents a resolved 2xx response schema.
  it('at least one operation declares a resolved 2xx response schema (P3)', () => {
    const withResolved = allOps.filter(({ op }) => {
      const responses = op.responses ?? {};
      return Object.entries(responses).some(([code, resp]) => {
        const n = Number(code);
        if (!(n >= 200 && n < 300)) return false;
        const schema = resp.content?.['application/json']?.schema;
        return isResolvedSchema(schema);
      });
    });
    expect(withResolved.length).toBeGreaterThan(0);
  });

  // No leftover unresolved resolver stubs anywhere in documented JSON schemas.
  it('contains no unresolved { vendor: "zod" } resolver stubs in any JSON response schema', () => {
    const stubs: string[] = [];
    for (const { path, method, op } of allOps) {
      for (const [code, resp] of Object.entries(op.responses ?? {})) {
        const schema = resp.content?.['application/json']?.schema as AnyObj | undefined;
        if (
          schema && typeof schema === 'object' &&
          Object.keys(schema).length === 1 && schema.vendor === 'zod'
        ) {
          stubs.push(`${method.toUpperCase()} ${path} [${code}]`);
        }
      }
    }
    expect(stubs).toEqual([]);
  });
});

describe('OpenAPI coverage — preserved tag groups (Requirement 2)', () => {
  // Preserve Requirement 2 — the previously-documented groups remain present.
  it('has at least one operation each tagged Auth, Recipes, Admin, and Health', () => {
    const countByTag = (tag: string) =>
      allOps.filter(({ op }) => (op.tags ?? []).includes(tag)).length;
    expect(countByTag('Auth')).toBeGreaterThan(0);
    expect(countByTag('Recipes')).toBeGreaterThan(0);
    expect(countByTag('Admin')).toBeGreaterThan(0);
    expect(countByTag('Health')).toBeGreaterThan(0);
  });
});

describe('OpenAPI coverage — Tag_Registry is well-formed (P6)', () => {
  it('tag names are unique', () => {
    const names = (spec.tags ?? []).map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every tag has a description of length 1–200', () => {
    const offenders = (spec.tags ?? [])
      .filter((t) => {
        const len = (t.description ?? '').length;
        return len < 1 || len > 200;
      })
      .map((t) => t.name);
    expect(offenders).toEqual([]);
  });
});

describe('OpenAPI coverage — non-JSON routes (Requirements 9.x)', () => {
  function findOp(predicate: (path: string) => boolean): Operation | undefined {
    const entry = allOps.find(({ path }) => predicate(path));
    return entry?.op;
  }

  it('share operation documents text/html and is not a JSON envelope', () => {
    const op = findOp((p) => p.includes('/share'));
    expect(op).toBeDefined();
    const ok = op!.responses?.['200'];
    expect(ok).toBeDefined();
    expect(ok!.content?.['text/html']).toBeDefined();
    expect(ok!.content?.['application/json']).toBeUndefined();
  });

  it('sitemap operation documents application/xml and is not a JSON envelope', () => {
    const op = findOp((p) => p.includes('sitemap'));
    expect(op).toBeDefined();
    const ok = op!.responses?.['200'];
    expect(ok).toBeDefined();
    expect(ok!.content?.['application/xml']).toBeDefined();
    expect(ok!.content?.['application/json']).toBeUndefined();
  });

  it('qrcode 200 documents an image content type and is not a JSON envelope', () => {
    const op = findOp((p) => p.includes('/qrcode/recipe'));
    expect(op).toBeDefined();
    const ok = op!.responses?.['200'];
    expect(ok).toBeDefined();
    const ct = ok!.content ?? {};
    const hasImage = 'image/png' in ct || 'image/svg+xml' in ct;
    expect(hasImage).toBe(true);
    expect(ct['application/json']).toBeUndefined();
  });
});
