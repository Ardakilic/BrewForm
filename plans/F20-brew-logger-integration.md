# F20 — Brew Logger App Integration

> **Validation status (2026-07-04): ❌ Invalid — blocked**
>
> - Blocked on F02: depends on the `brewLogs` table + brew-log module, neither of which exists (no brew-log module among the 18 API modules).
> - Also uses axios-style client calls — the web API client is a custom fetch wrapper, not axios.
> - Re-validate after F02 lands.

## Overview

Import and export brew logs from popular brew logging apps (Beanconqueror, Artisan). Users can upload CSV/JSON files exported from these apps, preview parsed entries, and import them into BrewForm. Also supports exporting BrewForm brew logs to CSV/JSON.

## Goals

1. Import brew logs from Beanconqueror (JSON) and Artisan (CSV) formats
2. Export BrewForm brew logs to CSV and JSON
3. Validate imported data through the same Zod schemas as manual entries
4. Provide preview before committing imports
5. Map external fields to BrewForm's brew log schema

## User Stories

| # | As a… | I want to… | So that… |
|---|-------|-----------|----------|
| US-1 | Authenticated user | Import brew logs from a Beanconqueror JSON export | I can migrate my existing brew history |
| US-2 | Authenticated user | Import brew logs from an Artisan CSV export | I can migrate my existing brew history |
| US-3 | Authenticated user | Preview imported brew logs before confirming | I can review and fix issues |
| US-4 | Authenticated user | Export my BrewForm brew logs to CSV | I can back up or analyze my data elsewhere |
| US-5 | Authenticated user | Export my BrewForm brew logs to JSON | I can back up or migrate to another app |
| US-6 | Authenticated user | See warnings for entries that can't be matched to a BrewForm recipe | I know which entries need manual assignment |

## Technical Design

### No New Tables

This feature uses the existing `brewLogs` table (defined in F02). No schema changes required.

### Import Adapters

Create `apps/api/src/modules/brew-log/adapters/`:

#### `beanconqueror.ts`

```ts
/**
 * Beanconqueror JSON export format adapter.
 * Parses Beanconqueror's JSON export into BrewForm brew log data.
 */
export interface BeanconquerorBrew {
  brew_date?: string;
  coffee_name?: string;
  coffee_weight?: number;
  brew_weight?: number;
  grind_weight?: number;
  brew_time?: number;
  notes?: string;
  rating?: number;
}

export function parseBeanconquerorJson(
  content: string
): Array<{
  brewedAt?: string;
  doseActual?: number;
  yieldActual?: number;
  extractionTimeSeconds?: number;
  notes?: string;
  personalRating?: number;
  coffeeName?: string;
}> {
  const data = JSON.parse(content);
  const brews: BeanconquerorBrew[] = Array.isArray(data) ? data : data.brews || [];

  return brews.map(brew => ({
    brewedAt: brew.brew_date,
    doseActual: brew.grind_weight || brew.coffee_weight,
    yieldActual: brew.brew_weight,
    extractionTimeSeconds: brew.brew_time,
    notes: brew.notes,
    personalRating: brew.rating,
    coffeeName: brew.coffee_name,
  }));
}
```

#### `artisan.ts`

```ts
/**
 * Artisan CSV export format adapter.
 * Parses Artisan's CSV format into BrewForm brew log data.
 */
export function parseArtisanCsv(
  content: string
): Array<{
  brewedAt?: string;
  doseActual?: number;
  yieldActual?: number;
  extractionTimeSeconds?: number;
  notes?: string;
  coffeeName?: string;
}> {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

  const dateIdx = headers.indexOf('date');
  const timeIdx = headers.indexOf('time');
  const coffeeIdx = headers.indexOf('coffee');
  const weightIdx = headers.indexOf('weight');
  const brewWeightIdx = headers.indexOf('brew_weight');
  const durationIdx = headers.indexOf('duration');
  const notesIdx = headers.indexOf('notes');

  return lines.slice(1).map(line => {
    const cols = line.split(',').map(c => c.trim());
    const dateStr = dateIdx >= 0 ? cols[dateIdx] : undefined;
    const timeStr = timeIdx >= 0 ? cols[timeIdx] : undefined;

    return {
      brewedAt: dateStr && timeStr ? `${dateStr}T${timeStr}` : dateStr,
      doseActual: weightIdx >= 0 ? parseFloat(cols[weightIdx]) || undefined : undefined,
      yieldActual: brewWeightIdx >= 0 ? parseFloat(cols[brewWeightIdx]) || undefined : undefined,
      extractionTimeSeconds: durationIdx >= 0 ? parseInt(cols[durationIdx]) || undefined : undefined,
      notes: notesIdx >= 0 ? cols[notesIdx] : undefined,
      coffeeName: coffeeIdx >= 0 ? cols[coffeeIdx] : undefined,
    };
  }).filter(row => row.coffeeName || row.brewedAt);
}
```

### Module: `modules/brew-log/`

#### `service.ts` — New Functions

```ts
import { parseBeanconquerorJson } from './adapters/beanconqueror.ts';
import { parseArtisanCsv } from './adapters/artisan.ts';
import { createLogger } from '../../utils/logger/index.ts';

const logger = createLogger('brew-log-service');

export type ImportFormat = 'beanconqueror' | 'artisan' | 'csv';

export interface ParsedBrewLog {
  brewedAt?: string;
  doseActual?: number;
  yieldActual?: number;
  extractionTimeSeconds?: number;
  notes?: string;
  personalRating?: number;
  coffeeName?: string;
}

/**
 * Parse uploaded file into brew log entries based on format.
 */
export async function parseBrewLogImport(
  fileContent: string,
  format: ImportFormat
): Promise<{ entries: ParsedBrewLog[]; errors: string[] }> {
  const errors: string[] = [];
  try {
    let entries: ParsedBrewLog[];
    switch (format) {
      case 'beanconqueror':
        entries = parseBeanconquerorJson(fileContent);
        break;
      case 'artisan':
      case 'csv':
        entries = parseArtisanCsv(fileContent);
        break;
      default:
        errors.push(`Unsupported format: ${format}`);
        return { entries: [], errors };
    }
    if (entries.length === 0) errors.push('No brew log entries found');
    if (entries.length > 500) errors.push('Maximum 500 entries per import');
    return { entries, errors };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(message);
    return { entries: [], errors };
  }
}

/**
 * Import brew log entries.
 * Each entry is validated against BrewLogCreateSchema.
 * Entries that reference a coffee name are matched to user's beans.
 */
export async function importBrewLogs(
  userId: string,
  entries: ParsedBrewLog[]
): Promise<{ imported: number; failed: number; errors: string[] }> {
  let imported = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const entry of entries) {
    try {
      await model.create({
        userId,
        recipeId: '', // Will need user to assign
        brewedAt: entry.brewedAt ? new Date(entry.brewedAt) : new Date(),
        yieldActual: entry.yieldActual || null,
        doseActual: entry.doseActual || null,
        notes: entry.notes || null,
        personalRating: entry.personalRating || null,
      });
      imported++;
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      errors.push(message);
    }
  }

  logger.info({ userId, imported, failed }, 'Brew log import completed');
  return { imported, failed, errors };
}

/**
 * Export brew logs to JSON format.
 */
export async function exportBrewLogsJson(userId: string): Promise<object[]> {
  const { brewLogs } = await model.findByUserId(userId, 1, 10000);
  return brewLogs.map(log => ({
    brewedAt: log.brewedAt,
    doseActual: log.doseActual,
    yieldActual: log.yieldActual,
    notes: log.notes,
    personalRating: log.personalRating,
    createdAt: log.createdAt,
  }));
}

/**
 * Export brew logs to CSV format.
 */
export async function exportBrewLogsCsv(userId: string): Promise<string> {
  const logs = await exportBrewLogsJson(userId);
  if (logs.length === 0) return 'brewedAt,doseActual,yieldActual,notes,personalRating\n';

  const headers = ['brewedAt', 'doseActual', 'yieldActual', 'notes', 'personalRating'];
  const rows = logs.map(log =>
    headers.map(h => {
      const val = (log as Record<string, unknown>)[h];
      if (val === null || val === undefined) return '';
      if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
      return String(val);
    }).join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}
```

#### `index.ts` — New Routes

Add to existing brew-log module routes:

```ts
// POST /brew-logs/import — Import from CSV/JSON
// GET /brew-logs/export — Export to CSV/JSON

brewLog.post('/import', authMiddleware, async (c) => {
  const userId = c.get('userId') as string;
  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  const format = formData.get('format') as string || 'csv';

  if (!file) return error(c, 'BAD_REQUEST', 'No file provided', 400);

  const content = await file.text();
  const { entries, errors: parseErrors } = await service.parseBrewLogImport(content, format as any);
  if (parseErrors.length > 0) return error(c, 'VALIDATION_ERROR', parseErrors.join('; '), 400);

  const result = await service.importBrewLogs(userId, entries);
  return success(c, result, 201);
});

brewLog.get('/export', authMiddleware, async (c) => {
  const userId = c.get('userId') as string;
  const format = c.req.query('format') || 'json';

  if (format === 'csv') {
    const csv = await service.exportBrewLogsCsv(userId);
    return c.text(csv, 200, {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="brewform-brew-logs.csv"',
    });
  }

  const json = await service.exportBrewLogsJson(userId);
  return success(c, json);
});
```

### Frontend Components

#### Modifications to Existing Pages

- **BrewLogListPage**: Add "Import" and "Export" buttons in header

#### New Components

| Component | Location | Description |
|-----------|----------|-------------|
| `BrewLogImportModal` | `components/brew-log/BrewLogImportModal.tsx` | Modal with format selector, file upload, preview |
| `BrewLogImportPreview` | `components/brew-log/BrewLogImportPreview.tsx` | Table showing parsed entries before import |
| `ExportDropdown` | `components/brew-log/ExportDropdown.tsx` | Dropdown with CSV/JSON export options |

#### API Client

```ts
export async function importBrewLogs(file: File, format: string) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('format', format);
  return client.post('/brew-logs/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

export async function exportBrewLogs(format: 'csv' | 'json') {
  if (format === 'csv') {
    const response = await client.get('/brew-logs/export', { params: { format: 'csv' } });
    return response.data;
  }
  return client.get('/brew-logs/export', { params: { format: 'json' } });
}
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/brew-logs/import` | Required | Import brew logs from CSV/JSON |
| `GET` | `/api/v1/brew-logs/export` | Required | Export brew logs as CSV or JSON |

## Acceptance Criteria

- [ ] User can import brew logs from Beanconqueror JSON export
- [ ] User can import brew logs from Artisan CSV export
- [ ] User can preview parsed entries before importing
- [ ] Imported entries are validated against BrewLogCreateSchema
- [ ] User can export brew logs to CSV
- [ ] User can export brew logs to JSON
- [ ] Import shows success/failure count
- [ ] Maximum 500 entries per import
- [ ] All queries use soft-delete pattern
- [ ] Type-check passes (`make check`)
- [ ] Lint passes (`make lint`)
- [ ] Tests pass (`make test`)

## Implementation Steps

1. Create `apps/api/src/modules/brew-log/adapters/beanconqueror.ts`
2. Create `apps/api/src/modules/brew-log/adapters/artisan.ts`
3. Add `parseBrewLogImport`, `importBrewLogs`, `exportBrewLogsJson`, `exportBrewLogsCsv` to `apps/api/src/modules/brew-log/service.ts`
4. Add `POST /import` and `GET /export` routes to brew-log module
5. Create `apps/web/src/components/brew-log/BrewLogImportModal.tsx`
6. Create `apps/web/src/components/brew-log/BrewLogImportPreview.tsx`
7. Create `apps/web/src/components/brew-log/ExportDropdown.tsx`
8. Modify `BrewLogListPage` to include import/export buttons
9. Add API client functions
10. Write tests for adapters, service, and API endpoints
11. Run `make check && make lint && make test`

## Dependencies

- Existing `brewLogs` table (from F02)
- Existing `authMiddleware`
- Existing response helpers
- Existing `BrewLogCreateSchema` in shared schemas
