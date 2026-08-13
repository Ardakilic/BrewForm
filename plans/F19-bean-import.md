# F19 — Coffee Bean Database Import

> **Validation status (2026-08-13): refreshed — corrections below**
>
> **Note:** The body below this line is the pre-refresh draft (itself carrying an older 2026-07-13 banner); treat the corrections in THIS banner as authoritative. Bean CRUD is fully shipped — F19's net-new scope is only the CSV import pipeline, the external-search stub, and the web import UI.
>
> - **Already shipped (do not rebuild):** full bean CRUD exists — `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id`, all with `describeRoute()` (+ `zValidator` on the routes that take input — `GET /:id`/`DELETE /:id` take none) (apps/api/src/modules/bean/index.ts:21-215), service with ownership checks (bean/service.ts:19-100), model with soft deletes (bean/model.ts:12-54), and web `beanApi` (apps/web/src/api/index.ts:132-138). Net-new for F19: csv-parser, adapters/external-search.ts, two service functions, two routes, two web components, import button.
> - `beans` table is now at packages/db/src/schema.ts:419-447 (the 2026-07 banner's `:386-414` is stale). Columns still match the plan's field list (`name`, `brand`, `vendorId`, `roaster`, `roastLevel`, `processing`, `origin`, `userId`, `deletedAt`) — "No New Tables" still holds. A separate `coffeeVarieties` table (schema.ts:456) and `coffee-variety` module exist but are OUT of F19 scope.
> - Model citations still valid: `findByUser(userId, page, perPage)` → `{ beans, total }` (bean/model.ts:23), `create` (bean/model.ts:35). The plan's service snippet must add `import * as model from './model.ts'` (it omits it) and reuse the existing exported logger `log = createLogger('bean-service')` (bean/service.ts:16) instead of declaring a second `logger`.
> - **OpenAPI is mandatory:** the plan's route snippets have no `describeRoute()` — every new route needs tags `['Beans']` (already registered at apps/api/src/routes/openapi.ts:65), `security: [{ bearerAuth: [] }]`, and `resolver()`-wrapped responses. The `{ imported, skipped, importedIds }` result needs a new Output Schema in packages/shared/src/schemas/responses/ (pattern: `BeanOutputSchema` at responses/bean.ts:12) plus a co-located unit test, wrapped in `successEnvelope()`. The multipart request must be documented as `multipart/form-data`, NOT via `jsonRequestBody()`. The coverage test (apps/api/src/routes/openapi.coverage.test.ts, `/api/v1/beans` in scope at :60) enforces this — `make test-api` after adding routes.
> - `BeanImportCsvSchema` with `z.instanceof(File)` is unnecessary — multipart is read with `c.req.formData()` (precedent: photo/index.ts:81), never through `zValidator`. Only `BeanSearchExternalSchema` is needed. Both remain net-new: packages/shared/src/schemas/bean.ts still has only `BeanCreateSchema`/`BeanUpdateSchema` (:7-21).
> - bodyLimit (D24) already applies: 1 MB on all routes except `/api/v1/photos` (apps/api/src/middleware/bodyLimit.ts:29-31, main.ts:74). CSV uploads are capped at 1 MB — fine for 100-row imports, nothing to add.
> - Web client (2026-07 correction still current): there is NO axios-style `client.post(endpoint, body, { headers })`. Add to `beanApi`: `api.upload('/beans/import-csv', formData)` (apps/web/src/api/client.ts:134-139, posts `FormData` with empty headers so the browser sets the boundary) and `api.post('/beans/search-external', { query })` (client.ts:127-128). `apps/web/src/api/types.ts` was DELETED (D42) — response types are `z.infer` from `@brewform/shared/schemas`.
> - Frontend targets verified: `BeanListPage` exists (apps/web/src/pages/beans/BeanListPage.tsx, header row at :98-105 for the import button); there is no `components/bean/` directory yet, so `BeanImportModal`/`BeanImportPreview` are genuinely net-new (no import UI exists anywhere). The page is fully i18n'd via `t()` — new user-facing strings need translation keys.
> - Tests: use `*.test.ts` naming with `jsr:@std/testing/bdd` + `@std/expect`; extend the existing bean/model.test.ts, bean/service.test.ts, bean/index.test.ts rather than creating new harnesses.
> - Still-valid caveats: the naive `split(',')` parser cannot handle quoted/escaped fields (no CSV util exists in the repo — verified); duplicate-check via `findByUser(userId, 1, 1000)` silently caps at 1000 existing beans (`ponytail:` ceiling — switch to a name-scoped count query if users exceed it). `success(c, data, 201)` / `error(c, code, msg, status)` signatures confirmed at apps/api/src/utils/response/index.ts:14 and :103.

> **Validation status (2026-07-13): ⚠️ Outdated — corrections below**
>
> - Backend still matches the `beans` table exactly (`packages/db/src/schema.ts:386-414`) and `bean/model.ts` (`findByUser(userId, page, perPage)` → `{ beans, total }` at model.ts:23; `create` at model.ts:35). `success(c, data, 201)` / `error(c, code, msg, status)` signatures confirmed (`equipment/index.ts:121,197`). CSV-parser caveat (no quoted-field handling) still stands.
> - Web client changed under D42. There is NO generic `client.post(endpoint, body, { headers })` axios-style call. `apps/web/src/api/index.ts` now exposes domain objects (e.g. `beanApi`) built on `api` from `./client.ts` — add the import calls to `beanApi`. For the multipart upload use the dedicated `api.upload('/beans/import-csv', formData)` (`client.ts:120-125`): it posts `FormData` with empty headers so the browser sets the boundary. `api.post` JSON-stringifies its body and cannot carry `FormData`.
> - `searchExternalBeans`: use `api.post('/beans/search-external', { query })`.
> - `BeanImportCsvSchema` / `BeanSearchExternalSchema` are net-new — only `BeanCreateSchema`/`BeanUpdateSchema` exist today (`packages/shared/src/schemas/bean.ts`).

## Overview

Integrate with external coffee bean databases for auto-population of bean metadata. Users can search external sources, preview results, and import bean data directly into their BrewForm bean collection. First implementation uses CSV import; real API integration deferred.

## Goals

1. Let users search external coffee bean databases by query
2. Let users import external bean metadata into their own beans
3. Support CSV file import as the first external data source
4. Provide preview before committing imports
5. Avoid duplicating beans the user already owns

## User Stories

| # | As a… | I want to… | So that… |
|---|-------|-----------|----------|
| US-1 | Authenticated user | Upload a CSV file of coffee beans | I can bulk-import beans from spreadsheets |
| US-2 | Authenticated user | Search for beans by name, brand, or origin | I can find beans from external databases |
| US-3 | Authenticated user | Preview import results before confirming | I can review and deselect beans I don't want |
| US-4 | Authenticated user | Import selected beans from search results | I don't have to manually enter bean data |
| US-5 | Authenticated user | See a warning if imported beans already exist | I avoid duplicate bean entries |

## Technical Design

### No New Tables

This feature enhances the existing `bean` module. No schema changes are required — imported beans use the same `beans` table with existing fields (`name`, `brand`, `vendorId`, `roaster`, `roastLevel`, `processing`, `origin`).

### CSV Import Parser

Create `apps/api/src/utils/import/csv-parser.ts`:

```ts
/**
 * Parse a CSV string into structured bean data.
 * Expected columns: name, brand, roaster, roast_level, processing, origin
 * Additional columns are ignored.
 */
export interface CsvBeanRow {
  name: string;
  brand?: string;
  roaster?: string;
  roastLevel?: string;
  processing?: string;
  origin?: string;
}

export function parseCsvBeans(csvContent: string): CsvBeanRow[] {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const nameIdx = headers.indexOf('name');
  if (nameIdx === -1) throw new Error('CSV must have a "name" column');

  const brandIdx = headers.indexOf('brand');
  const roasterIdx = headers.indexOf('roaster');
  const roastLevelIdx = headers.indexOf('roast_level');
  const processingIdx = headers.indexOf('processing');
  const originIdx = headers.indexOf('origin');

  return lines.slice(1).map(line => {
    const cols = line.split(',').map(c => c.trim());
    return {
      name: cols[nameIdx],
      brand: brandIdx >= 0 ? cols[brandIdx] : undefined,
      roaster: roasterIdx >= 0 ? cols[roasterIdx] : undefined,
      roastLevel: roastLevelIdx >= 0 ? cols[roastLevelIdx] : undefined,
      processing: processingIdx >= 0 ? cols[processingIdx] : undefined,
      origin: originIdx >= 0 ? cols[originIdx] : undefined,
    };
  }).filter(row => row.name.length > 0);
}
```

### External Search Adapter Pattern

Create `apps/api/src/modules/bean/adapters/external-search.ts`:

```ts
/**
 * Adapter interface for external bean search APIs.
 * Start with a stub implementation; real API integration deferred.
 */
export interface ExternalBeanResult {
  name: string;
  brand: string;
  roaster?: string;
  roastLevel?: string;
  processing?: string;
  origin?: string;
  externalId?: string;
  source: string;
}

export interface BeanSearchAdapter {
  search(query: string): Promise<ExternalBeanResult[]>;
}

/**
 * Stub adapter — returns empty results.
 * Replace with real API integration later.
 */
export class StubBeanSearchAdapter implements BeanSearchAdapter {
  async search(_query: string): Promise<ExternalBeanResult[]> {
    return [];
  }
}
```

### Module: `modules/bean/`

#### `model.ts` — No Changes

Existing bean model functions (`findById`, `findByUser`, `create`, `update`, `softDelete`) are sufficient.

#### `service.ts` — New Functions

```ts
import { parseCsvBeans, type CsvBeanRow } from '../../utils/import/csv-parser.ts';
import { createLogger } from '../../utils/logger/index.ts';

const logger = createLogger('bean-service');

/**
 * Parse uploaded CSV into bean data rows.
 * Validates format and returns parsed rows with any errors.
 */
export async function parseCsvImport(
  fileContent: string
): Promise<{ beans: CsvBeanRow[]; errors: string[] }> {
  const errors: string[] = [];
  try {
    const beans = parseCsvBeans(fileContent);
    if (beans.length === 0) errors.push('No valid beans found in CSV');
    if (beans.length > 100) errors.push('Maximum 100 beans per import');
    return { beans, errors };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(message);
    return { beans: [], errors };
  }
}

/**
 * Import beans from parsed CSV data.
 * Skips beans with names that already exist for this user.
 * Returns summary of imported/skipped counts.
 */
export async function importBeansFromCsv(
  userId: string,
  beans: CsvBeanRow[]
): Promise<{ imported: number; skipped: number; importedIds: string[] }> {
  const existing = await model.findByUser(userId, 1, 1000);
  const existingNames = new Set(existing.beans.map(b => b.name.toLowerCase()));

  let imported = 0;
  let skipped = 0;
  const importedIds: string[] = [];

  for (const bean of beans) {
    if (existingNames.has(bean.name.toLowerCase())) {
      skipped++;
      continue;
    }
    const created = await model.create({
      name: bean.name,
      brand: bean.brand || null,
      roaster: bean.roaster || null,
      roastLevel: bean.roastLevel || null,
      processing: bean.processing || null,
      origin: bean.origin || null,
      userId,
    });
    importedIds.push(created.id);
    imported++;
  }

  logger.info({ userId, imported, skipped }, 'CSV import completed');
  return { imported, skipped, importedIds };
}
```

#### `index.ts` — New Routes

Add to existing `apps/api/src/modules/bean/index.ts`:

```ts
// POST /beans/import-csv — Upload and import beans from CSV
// POST /beans/search-external — Search external bean database (stub for now)

bean.post('/import-csv', authMiddleware, async (c) => {
  const userId = c.get('userId') as string;
  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return error(c, 'BAD_REQUEST', 'No file provided', 400);
  if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
    return error(c, 'BAD_REQUEST', 'File must be CSV', 400);
  }

  const content = await file.text();
  const { beans: parsed, errors } = await service.parseCsvImport(content);
  if (errors.length > 0) return error(c, 'VALIDATION_ERROR', errors.join('; '), 400);

  const result = await service.importBeansFromCsv(userId, parsed);
  return success(c, result, 201);
});

bean.post('/search-external', authMiddleware, zValidator('json', z.object({
  query: z.string().min(1).max(200),
})), async (c) => {
  const { query } = c.req.valid('json');
  // Stub: returns empty results for now
  return success(c, { results: [] });
});
```

### Shared Schemas

Add to `packages/shared/src/schemas/bean.ts`:

```ts
export const BeanImportCsvSchema = z.object({
  file: z.instanceof(File),
});

export const BeanSearchExternalSchema = z.object({
  query: z.string().min(1).max(200),
});
```

### Frontend Components

#### Modifications to Existing Pages

- **BeanListPage** (`apps/web/src/pages/beans/BeanListPage.tsx`): Add "Import Beans" button in header
- **BeanImportModal** (`apps/web/src/components/bean/BeanImportModal.tsx`): New component

#### New Components

| Component | Location | Description |
|-----------|----------|-------------|
| `BeanImportModal` | `components/bean/BeanImportModal.tsx` | Modal with CSV upload, preview table, import button |
| `BeanImportPreview` | `components/bean/BeanImportPreview.tsx` | Table showing parsed beans with select/deselect checkboxes |

#### API Client

Add to `apps/web/src/api/index.ts`:

```ts
export async function importBeansFromCsv(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return client.post('/beans/import-csv', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

export async function searchExternalBeans(query: string) {
  return client.post('/beans/search-external', { query });
}
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/beans/import-csv` | Required | Upload CSV, parse, import beans |
| `POST` | `/api/v1/beans/search-external` | Required | Search external bean database (stub) |

## Acceptance Criteria

- [ ] User can click "Import Beans" on BeanListPage to open import modal
- [ ] User can upload a CSV file with columns: name (required), brand, roaster, roast_level, processing, origin
- [ ] System parses CSV and shows preview of beans to import
- [ ] User can deselect individual beans before importing
- [ ] System imports selected beans and skips duplicates (by name, case-insensitive)
- [ ] System shows import summary: X imported, Y skipped
- [ ] Search external endpoint returns empty results (stub)
- [ ] All queries use soft-delete pattern
- [ ] Type-check passes (`make check`)
- [ ] Lint passes (`make lint`)
- [ ] Tests pass (`make test`)

## Implementation Steps

1. Create `apps/api/src/utils/import/csv-parser.ts` — CSV parsing utility
2. Create `apps/api/src/modules/bean/adapters/external-search.ts` — adapter interface + stub
3. Add `parseCsvImport` and `importBeansFromCsv` to `apps/api/src/modules/bean/service.ts`
4. Add `POST /import-csv` and `POST /search-external` routes to `apps/api/src/modules/bean/index.ts`
5. Add `BeanImportCsvSchema` and `BeanSearchExternalSchema` to `packages/shared/src/schemas/bean.ts`
6. Create `apps/web/src/components/bean/BeanImportModal.tsx`
7. Create `apps/web/src/components/bean/BeanImportPreview.tsx`
8. Modify `apps/web/src/pages/beans/BeanListPage.tsx` to include import button
9. Add API client functions in `apps/web/src/api/index.ts`
10. Write tests for CSV parser, service, and API endpoints
11. Run `make check && make lint && make test`

## Dependencies

- Existing `beans` table (no schema changes)
- Existing `authMiddleware`
- Existing response helpers (`success`, `error`)
- Existing `BeanCreateSchema` in shared schemas
