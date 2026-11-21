/**
 * Markdown rendering of the generated OpenAPI document for `docs/api-reference.md` (ADR-021,
 * doc-drift-check capability "The generated API reference stays in sync with the OpenAPI
 * document"). Pure functions only: `apps/api/scripts/generate-api-reference.ts` fetches the real
 * document from `/api/v1/openapi.json`, renders it with {@link renderApiReference} and writes the
 * file; CI regenerates it and fails on any diff, so the output must be deterministic.
 */

/** HTTP methods in the order operations are listed under a path. */
const METHOD_ORDER = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'];

/** Enum values listed in a parameter cell before the rest is elided. */
const MAX_ENUM_VALUES = 8;

/** Section title for operations that declare no tag. */
const UNTAGGED = 'Other';

/** The subset of a JSON Schema the parameter cell summarises. */
export interface ReferenceSchema {
  type?: string | string[];
  format?: string;
  enum?: unknown[];
  items?: ReferenceSchema;
}

/** The subset of an OpenAPI parameter object the reference renders. */
export interface ReferenceParameter {
  name: string;
  in: string;
  required?: boolean;
  schema?: ReferenceSchema;
}

/** The subset of an OpenAPI operation object the reference renders. */
export interface ReferenceOperation {
  tags?: string[];
  summary?: string;
  security?: Record<string, unknown[]>[];
  parameters?: ReferenceParameter[];
  responses?: Record<string, unknown>;
}

/** The subset of an OpenAPI 3.x document the reference renders. */
export interface ReferenceDocument {
  info?: { title?: string; version?: string };
  tags?: { name: string; description?: string }[];
  paths?: Record<string, Record<string, ReferenceOperation | unknown>>;
}

/** A mounted Hono route (`app.routes` entry) as seen by {@link findUndocumentedRoutes}. */
export interface MountedRoute {
  method: string;
  path: string;
}

/** One operation flattened out of the `paths` map. */
interface FlatOperation {
  method: string;
  path: string;
  op: ReferenceOperation;
}

/** Code-unit string comparison (locale-independent, so output is stable across machines). */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Escapes text for a Markdown table cell: pipes are escaped and newlines become spaces. */
function cell(text: string): string {
  return text.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
}

/** GitHub-style heading anchor: lowercase, spaces to hyphens, punctuation dropped. */
export function headingAnchor(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s/g, '-');
}

/** True when the operation requires credentials: a non-empty `security` with a non-empty requirement. */
export function requiresAuth(op: ReferenceOperation): boolean {
  return (op.security ?? []).some((req) => Object.keys(req).length > 0);
}

/** Summarises a parameter schema: enum values (elided past {@link MAX_ENUM_VALUES}), else format, else type. */
function schemaSummary(schema: ReferenceSchema | undefined): string {
  if (!schema) return '';
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    const values = schema.enum.slice(0, MAX_ENUM_VALUES).map(String);
    if (schema.enum.length > MAX_ENUM_VALUES) values.push('…');
    return values.join(' | ');
  }
  if (schema.format) return schema.format;
  const type = Array.isArray(schema.type) ? schema.type.join(' | ') : schema.type;
  if (type === 'array') {
    const items = schemaSummary(schema.items);
    return items ? `${items}[]` : 'array';
  }
  return type ?? '';
}

/**
 * Renders one parameter as `` `name` (in, required, type) ``: path parameters are always
 * required, so only other locations carry the `required` marker.
 */
export function renderParameter(param: ReferenceParameter): string {
  const notes = [param.in];
  if (param.required && param.in !== 'path') notes.push('required');
  const summary = schemaSummary(param.schema);
  if (summary) notes.push(summary);
  return `\`${param.name}\` (${notes.join(', ')})`;
}

/** Documented response codes in ascending numeric order (`default` and other keys last). */
function responseCodes(op: ReferenceOperation): string {
  const codes = Object.keys(op.responses ?? {});
  codes.sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isNaN(na) || Number.isNaN(nb)) return Number.isNaN(na) ? 1 : -1;
    return na - nb;
  });
  return codes.join(', ');
}

/** Flattens `paths` into operations, keeping only the HTTP-method keys. */
function flatten(doc: ReferenceDocument): FlatOperation[] {
  const ops: FlatOperation[] = [];
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    for (const [method, op] of Object.entries(item ?? {})) {
      if (METHOD_ORDER.includes(method.toLowerCase()) && op && typeof op === 'object') {
        ops.push({ method: method.toLowerCase(), path, op: op as ReferenceOperation });
      }
    }
  }
  return ops;
}

/** Sorts operations by path, then by {@link METHOD_ORDER}. */
function byPathThenMethod(a: FlatOperation, b: FlatOperation): number {
  return compare(a.path, b.path) || METHOD_ORDER.indexOf(a.method) - METHOD_ORDER.indexOf(b.method);
}

/**
 * Groups operations into sections: declared tags first in registry order, then undeclared tags
 * alphabetically, then untagged operations under {@link UNTAGGED}. Empty sections are dropped; an
 * operation with several tags is listed under each.
 */
function groupByTag(
  doc: ReferenceDocument,
): { name: string; description?: string; ops: FlatOperation[] }[] {
  const ops = flatten(doc).sort(byPathThenMethod);
  const declared = (doc.tags ?? []).map((t) => ({ name: t.name, description: t.description }));
  const declaredNames = new Set(declared.map((t) => t.name));
  const undeclared = [...new Set(ops.flatMap(({ op }) => op.tags ?? []))]
    .filter((name) => !declaredNames.has(name))
    .sort(compare)
    .map((name) => ({ name, description: undefined }));
  const sections = [...declared, ...undeclared].map((tag) => ({
    ...tag,
    ops: ops.filter(({ op }) => (op.tags ?? []).includes(tag.name)),
  }));
  const untagged = ops.filter(({ op }) => (op.tags ?? []).length === 0);
  if (untagged.length > 0) sections.push({ name: UNTAGGED, description: undefined, ops: untagged });
  return sections.filter((section) => section.ops.length > 0);
}

/**
 * Renders the OpenAPI document as the Markdown API reference: a heading with the API title and
 * version, a contents list, and one section per tag holding a table with method, path, summary,
 * auth marker (`Bearer` when `security` requires credentials, `—` when public), parameters and
 * documented response codes. Output is deterministic for a given document (sorted sections and
 * rows, locale-independent comparisons) and ends with a newline.
 *
 * @param doc - The OpenAPI document served at `/api/v1/openapi.json`.
 * @returns The Markdown body of `docs/api-reference.md` (the caller adds the generated banner).
 */
export function renderApiReference(doc: ReferenceDocument): string {
  const sections = groupByTag(doc);
  const operationCount = flatten(doc).length;
  const title = doc.info?.title ?? 'API';
  const version = doc.info?.version ? ` ${doc.info.version}` : '';
  const out: string[] = [
    `# ${title} reference`,
    '',
    `${title}${version}: ${operationCount} operations in ${sections.length} sections. ` +
      'Auth `Bearer` means the route requires `Authorization: Bearer <access token>`; ' +
      '`—` means it is public. Path parameters are always required.',
    '',
    '## Contents',
    '',
    ...sections.map((s) => `- [${s.name}](#${headingAnchor(s.name)}) (${s.ops.length})`),
  ];
  for (const section of sections) {
    out.push('', `## ${section.name}`, '');
    if (section.description) out.push(cell(section.description), '');
    out.push(
      '| Method | Path | Summary | Auth | Parameters | Responses |',
      '|---|---|---|---|---|---|',
    );
    for (const { method, path, op } of section.ops) {
      const params = (op.parameters ?? []).map((p) => cell(renderParameter(p))).join('<br>');
      out.push(
        `| \`${method.toUpperCase()}\` | \`${path}\` | ${cell(op.summary ?? '')} | ${
          requiresAuth(op) ? 'Bearer' : '—'
        } | ${params || '—'} | ${responseCodes(op)} |`,
      );
    }
  }
  return `${out.join('\n')}\n`;
}

/**
 * Lists mounted routes that the OpenAPI document does not describe, so the generator can warn
 * about routes missing `describeRoute()` metadata. Middleware entries (`ALL`), `HEAD`/`OPTIONS`
 * and the spec's own meta endpoints are ignored; Hono params (`:id`, `:path{.+}`) are compared in
 * OpenAPI form (`{id}`, `{path}`). Each route is reported once, as `METHOD /path`, sorted.
 *
 * @param routes      - Hono's `app.routes` entries.
 * @param doc         - The generated OpenAPI document.
 * @param ignorePaths - Paths never expected in the document (defaults to the OpenAPI meta routes).
 * @returns The undocumented routes, e.g. `['GET /api/v1/admin/users']`.
 */
export function findUndocumentedRoutes(
  routes: MountedRoute[],
  doc: ReferenceDocument,
  ignorePaths: string[] = ['/api/v1/openapi.json', '/api/v1/docs'],
): string[] {
  const missing = new Set<string>();
  for (const route of routes) {
    const method = route.method.toLowerCase();
    if (!METHOD_ORDER.includes(method) || method === 'head' || method === 'options') continue;
    if (ignorePaths.includes(route.path)) continue;
    const path = route.path.replace(/:([A-Za-z_][\w]*)(\{[^}]*\})?/g, '{$1}');
    if (!doc.paths?.[path]?.[method]) missing.add(`${method.toUpperCase()} ${path}`);
  }
  return [...missing].sort(compare);
}
