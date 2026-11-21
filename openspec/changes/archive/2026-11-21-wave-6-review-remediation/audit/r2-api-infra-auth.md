# Track r2: API infra and auth (review findings 3, 4, 6, 18, 26, 27, 28, 34-part, email logging)

| # | Verdict | Capability touched | Effort |
|---|---|---|---|
| 3 `/uploads` buffers whole files | confirmed | `photo-upload-security` (ADDED) | M |
| 4 admin user search | bigger (6 more model searches share the bug, D99.61 among them; the admin service also logs the raw query, often an email) | `advanced-search` (MODIFIED + ADDED) | M |
| 6 `rateLimitFailures` race | confirmed | `api-rate-limiting` (MODIFIED) | S |
| 18 `degraded` never clears | confirmed | `api-rate-limiting` (MODIFIED) | S |
| 26 `lower()` locale mismatch | partly (only `tr_TR`/`az_AZ` databases; duplicates do NOT get past the index, but a username with a capital `I` cannot be found at all) | `unique-identifiers` (MODIFIED ×3) | S |
| 27 `S3_PUBLIC_URL` trailing slash | bigger (`PUBLIC_APP_URL` has the same bug: reset/verify links get `//reset-password`) | `api-env-config` (ADDED), `model-test-coverage` (MODIFIED) | S |
| 28 partial storage write | confirmed (plus an `EEXIST` edge the fix must respect) | `photo-upload-security` (MODIFIED) | S |
| 34 dead identifier helpers + setup log lines | confirmed (the stale logs are also REQUIRED by `api-service-logging`) | `unique-identifiers` (MODIFIED ×2), `api-service-logging` (MODIFIED ×2) | S |
| "Not checked": mail errors in logs | confirmed (nodemailer puts recipient addresses on the error) | `error-handling` (ADDED) | S |

No schema change, no migration, no route or OpenAPI shape change in this track (`docs/api-reference.md`
does not need regenerating; the admin `/users` route has no `describeRoute`, and `/uploads` is not an
OpenAPI route).

---

## Finding 3: `/uploads` reads the whole file into memory and copies it

### 1. Verification

`apps/api/src/main.ts:113-155` (route mounted only when `STORAGE_DRIVER === 'local'`):

```ts
data = await readFile(filepath);                                   // :134 whole file
const body = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength); // :144 second copy
return new Response(body as ArrayBuffer, { headers: { 'content-type': …, 'content-length': … } });
```

- Size caps (`apps/api/src/utils/upload/limits.ts`): originals up to `UPLOAD_MAX_SIZE_BYTES`
  (default 10 MiB, `z.coerce.number().int().positive()`, **no upper bound**, `config/env.ts:207-211`),
  thumbnails `THUMBNAIL_MAX_SIZE_BYTES` = min(1 MiB, `UPLOAD_MAX_SIZE_BYTES`). A 10 MiB original costs
  about 20 MiB per in-flight request (file buffer + slice copy).
- Limits: `POLICIES.uploads` is 600/min per IP (`utils/rate-limit/policies.ts:68-75`), and the global
  policy skips `GET`/`HEAD /uploads/*` (`main.ts:61-65`). Nothing caps concurrency. ~55 parallel
  requests for one original exceed the API's 1 GiB limit (`compose.production.yml:254-255`).
- `HEAD`: Hono runs the GET handler for HEAD and drops the body (Context7 `/websites/hono_dev`,
  "HEAD Request Best Practices": HEAD is converted to GET, body stripped), so HEAD also reads the whole file.
- Keys never change content: `generateStorageKey` = `<uuidv4>.<ext>`, `thumbnailKey` = `<uuid>_medium.<ext>`
  (`utils/upload/index.ts:55-69`); legacy keys `<13-digit ts>-<8 hex>.<ext>` (`utils/storage/key.ts:4-7`);
  `LocalStorageDriver.save` uses `writeFile(…, { flag: 'wx' })` (`utils/storage/local.ts:34`), so a key is
  never rewritten. Immutable caching is safe.
- Edge (`apps/web/Caddyfile`, `docker-web-entrypoint.sh:97-114`): Caddy only reverse-proxies
  `/uploads/*` to the API; no edge cache. `encode zstd gzip` does not touch images (Context7
  `/caddyserver/website`, `encode` default `match` list has no `image/jpeg|png|webp`), and
  `reverse_proxy` streams responses by default (no `response_buffers`). So the API's
  `Cache-Control` reaches the browser unchanged.
- Existing tests that must keep passing: `utils/storage/storage.test.ts:118-140` (200 + `image/png` +
  exact bytes, 404 for a missing file, 403 for `..%2F..%2Fetc%2Fpasswd`), `main.rateLimit.test.ts:46-52,76-90`
  (uploads skip the global limiter, GET/HEAD). No test covers HEAD, null bytes, directories,
  `Cache-Control` or streaming.
- Spec: `photo-upload-security` "Explicit Content-Type on stored objects" (image type + nosniff) and
  "Legacy uploads keep resolving" (traversal guards, no generated-key pattern on reads). Nothing
  requires streaming or caching.

Verdict: **confirmed.**

### 2. Root cause

The wave-6 fix (named param instead of `*`) kept the `readFile` body and added a defensive copy.

### 3. Fix design

**Chosen:** a small handler `serveLocalUpload(c)` in a new `apps/api/src/utils/storage/serve.ts`, mounted
as `app.get('/uploads/:path{.+}', rateLimit(POLICIES.uploads), serveLocalUpload)`:

```ts
export const UPLOADS_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const CONTENT_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export async function serveLocalUpload(c: Context): Promise<Response> {
  const userPath = c.req.param('path');
  if (!userPath) return c.text('Bad Request', 400);
  const uploadDir = config.UPLOAD_DIR;                 // read per request (tests mutate it)
  const filepath = path.resolve(uploadDir, userPath);
  if (path.isAbsolute(userPath) || userPath.includes('..') || !filepath.startsWith(uploadDir + path.sep)) {
    log.warn({ requestId: c.get('requestId') }, 'serveLocalUpload refused a path outside UPLOAD_DIR');
    return c.text('Forbidden', 403);
  }
  let size: number;
  try {
    const info = await stat(filepath);                 // async; null byte / ENOENT / ENAMETOOLONG throw
    if (!info.isFile()) return c.notFound();           // directories, sockets, FIFOs
    size = info.size;
  } catch {
    return c.notFound();
  }
  const ext = path.extname(filepath).slice(1).toLowerCase();
  const headers = {
    'content-type': CONTENT_TYPES[ext] ?? 'application/octet-stream',
    'content-length': String(size),
    'cache-control': UPLOADS_CACHE_CONTROL,
  };
  if (c.req.method === 'HEAD') return new Response(null, { headers });   // never opens the file
  // One queued chunk: a slow client never makes the stream buffer the file.
  const body = Readable.toWeb(createReadStream(filepath), { strategy: { highWaterMark: 1 } });
  return new Response(body as unknown as ReadableStream<Uint8Array>, { headers });
}
```

Why each piece:
- `createReadStream` reads 64 KiB chunks (Context7 `/nodejs/node/v26.0.0`, `fs.createReadStream`:
  `highWaterMark` default `64 * 1024`).
- **Explicit `strategy: { highWaterMark: 1 }`** is required: `Readable.toWeb` takes `highWaterMark` from
  the Node stream (65536) when none is given and counts each chunk as size 1 (Context7
  `/nodejs/node/v26.0.0`, `stream.Readable.toWeb`: "If no value is provided, it will be taken from the
  given stream.Readable … size will be 1 for all the chunks"). Without it a slow-reading client lets the
  web queue hold up to 65536 chunks, i.e. the whole file, which recreates the attack with slow readers.
- **Not a `Blob` body** (`fs.openAsBlob`): `@hono/node-server` 2.1.6 buffers Blob bodies with
  `outgoing.end(new Uint8Array(await body.arrayBuffer()))` (source `src/listener.ts` at v2.1.6). A
  `ReadableStream` body is piped with `writeFromReadableStream`, which cancels the stream when the
  socket is destroyed (Context7 `/websites/deepwiki_honojs_node-server`, "writeFromReadableStream …
  Cancels the stream if the writable is destroyed"); cancel destroys the fs stream, which closes the fd
  (`autoClose: true`).
- **HEAD returns early**: Hono wraps the GET response as `new Response(null, res)`, so a stream opened
  for HEAD would never be read or cancelled and would leak its fd until GC. `c.req.method` is `'HEAD'`
  inside the handler (the raw request is passed through; `skipGlobalRateLimit` already relies on this).
- `stat` before streaming keeps the 404 behaviour for missing files, null bytes and directories, and
  gives `Content-Length`. A file deleted between `stat` and the first read makes the stream error after
  the headers; the adapter aborts that response. Acceptable: files are only deleted by the cleanup of a
  failed upload, whose key was never returned to anyone.
- Memory per request: ≤ one queued 64 KiB chunk + the Node stream's 64 KiB buffer. 600 concurrent
  requests ≈ 75 MiB. Concurrency cap not needed.
- Content types unchanged (jpg/jpeg/png/webp mapped, everything else `application/octet-stream`, legacy
  keys kept the client extension so the fallback stays); `nosniff` still comes from the global
  `secureHeaders` (`main.ts:91`); the `uploads` policy stays on the route.
- `Cache-Control: public, max-age=31536000, immutable` only on 200 (GET and HEAD), never on 403/404.

**Alternatives rejected:**
- `serveStatic` from `@hono/node-server/serve-static` (2.1.6, already a dependency). Facts (source
  `src/serve-static.ts` at v2.1.6; Context7 `/honojs/node-server/v2.1.4` README and
  `/websites/deepwiki_honojs_node-server` API table): options `root`, `path`, `index`, `precompressed`,
  `allowPercentInPath`, `rewriteRequestPath`, `onFound`, `onNotFound`; **no `mimes` option**; content
  type from Hono's full `getMimeType` table; a path containing `%` is rejected unless
  `allowPercentInPath`; `..`/`.` segments, `\` and `//` make it call `onNotFound` and `next()` (so 404 from
  the router, never 403); `root` is fixed when `serveStatic()` is called; it uses **`statSync`** (blocks the
  event loop per request); HEAD sets `Content-Length` and sends no body; it supports `Range` (and answers
  a malformed `Range` with a full-file 206). Rejected because: (1) the existing 403 traversal contract and
  test change to 404; (2) `.svg`/`.html` legacy files would be served as active content (`image/svg+xml`,
  `text/html`) instead of `application/octet-stream`; (3) `statSync` on the hot path; (4) `root` captured
  at import breaks `storage.test.ts`, which re-points `config.UPLOAD_DIR` per test; (5) `onFound` runs
  after the response is built, so overriding the content type there is not reliable.
- Serving `/uploads` straight from Caddy (`file_server` over a read-only mount of the uploads volume):
  only works for the compose topology, duplicates the traversal and content-type rules in Caddy, drops
  the `uploads` rate-limit policy, and needs a new volume mount. Out of proportion for this fix.

### 4. Tests

`apps/api/src/utils/storage/storage.test.ts` (failing first; the existing three upload cases stay):
- **Streams in chunks** (fails today: the old body is one ArrayBuffer chunk): save a 300 KiB `.webp`-named
  file through the driver, `GET` it, `const reader = res.body!.getReader(); const first = await reader.read();`
  assert `first.value!.byteLength <= 64 * 1024`, then read to the end, assert the concatenated bytes equal the
  file, `await reader.cancel()` in `finally`.
- **Immutable cache header** (fails today): 200 response has `cache-control` exactly
  `public, max-age=31536000, immutable` and `x-content-type-options: nosniff`.
- **HEAD** (fails today on `cache-control`): `app.request(url, { method: 'HEAD' })` → 200,
  `content-length` = file size, `content-type` = `image/png`, the cache header, and `await res.text() === ''`.
- **Null byte** → `GET /uploads/a%00.png` is 404 (passes today; locks the behaviour).
- **Directory** → `mkdir(<testDir>/dir.png)` then `GET /uploads/dir.png` is 404.
- **404 and 403 carry no `cache-control`**.

### 5. Spec impact

`photo-upload-security` — ADDED:

````markdown
### Requirement: Local uploads are streamed with bounded memory and cached as immutable

The local `/uploads/*` read handler SHALL stream each file from disk instead of reading it into memory, so that the memory one request holds stays bounded by the stream buffers (one 64 KiB read chunk plus at most one queued chunk) whatever the file size or the client's read speed, and SHALL send `Cache-Control: public, max-age=31536000, immutable` with every successful response.

- The handler SHALL `stat` the resolved path first and answer 404 when it does not exist, is not a
  regular file, or cannot be stat-ed (for example a path with a null byte). The traversal guards and
  their 403 answer SHALL stay unchanged.
- `HEAD` SHALL answer with `Content-Type`, `Content-Length` and the cache header and SHALL NOT open
  the file.
- The body SHALL be a `ReadableStream` built with `Readable.toWeb(createReadStream(path), { strategy:
  { highWaterMark: 1 } })`, never a `Blob` or an in-memory buffer.
- The content-type mapping (`jpg`/`jpeg` → `image/jpeg`, `png` → `image/png`, `webp` → `image/webp`,
  anything else `application/octet-stream`), `X-Content-Type-Options: nosniff` and the `uploads`
  rate-limit policy SHALL stay as they are.
- Immutable caching is safe because every key is generated on the server (`<uuid>.<ext>`, legacy
  `<timestamp>-<hex>.<ext>`) and the local driver creates files exclusively, so a URL never changes
  content. 403 and 404 responses SHALL NOT carry the cache header.

#### Scenario: A large file is streamed in chunks

- **WHEN** a 300 KiB file saved by the local driver is requested with `GET /uploads/<file>`
- **THEN** the first chunk read from the response body is at most 64 KiB and the full body equals the file

#### Scenario: Successful responses are cacheable forever

- **WHEN** a client requests `/uploads/<uuid>.webp` and the file exists
- **THEN** the response has `cache-control: public, max-age=31536000, immutable`, `content-type: image/webp` and `x-content-type-options: nosniff`

#### Scenario: HEAD answers headers only

- **WHEN** a client sends `HEAD /uploads/<uuid>.png` for an existing file
- **THEN** the response is 200 with `content-length` equal to the file size, the cache header, and an empty body

#### Scenario: Missing, invalid and non-file paths are 404 without the cache header

- **WHEN** a client requests a missing file, `/uploads/a%00.png`, or a path that is a directory
- **THEN** each response is 404 and has no `cache-control` header
````

### 6. Docs / ledger impact

- `docs/architecture.md:278` (item 9) and `docs/request-lifecycle.md:72` (row 9, "file bytes"): say the
  file is streamed (bounded memory) with `Cache-Control: public, max-age=31536000, immutable`.
- `AGENTS.md:77` middleware-stack sentence: "optional `/uploads/:path{.+}` static handler (local storage
  driver only, streamed, immutable cache, its own `uploads` policy)".
- Module docblocks: `main.ts:21-25` and `utils/storage/local.ts:7-15` (point at `serve.ts`).
- No D99 entry.

### 7. Draft tasks

- [ ] R2.1 Failing tests first in `apps/api/src/utils/storage/storage.test.ts`: the six cases of §4 (chunked 300 KiB body, immutable `cache-control` + nosniff, HEAD headers-only, `%00` → 404, directory → 404, no cache header on 403/404). Run `make test-specific filter=src/utils/storage/storage.test.ts` and confirm the chunk, cache-header and HEAD cases fail.
- [ ] R2.2 Create `apps/api/src/utils/storage/serve.ts` with `UPLOADS_CACHE_CONTROL` and `serveLocalUpload(c)` exactly as in §3 (module logger `createLogger('uploads')`, one `warn` with `requestId` on the 403 path, no per-request success log; `/** */` docblocks on both exports). In `apps/api/src/main.ts` replace the inline handler with `app.get('/uploads/:path{.+}', rateLimit(POLICIES.uploads), serveLocalUpload)`, drop the `readFile` and (if unused) `node:path` imports, and update the module docblock; update the `local.ts` class docblock to name `serve.ts`. Re-run the storage tests and `make test-specific filter=src/main.rateLimit.test.ts` until green.
- [ ] R2.3 Update `docs/architecture.md` item 9, `docs/request-lifecycle.md` row 9 and the `AGENTS.md` middleware-stack sentence (§6).

### 8. Risks / migration notes

- After deploy, browsers keep photos for a year. Keys are never reused, so this is only visible if an
  operator hand-edits a file in the uploads folder (a restore writes the same bytes under the same key).
- Soft-deleted photos keep their files (pre-existing; `deletePhoto` only sets `deletedAt`), and those URLs
  stay fetchable and now cacheable. Not a regression; see Cross-track notes.
- No Range support (same as today). Browsers do not need it for images.

---

## Finding 4: admin user search is case-sensitive and does not escape `%`/`_`

### 1. Verification

`apps/api/src/modules/admin/model.ts:36-46`:

```ts
const where = query ? and(isNull(users.deletedAt), or(
  like(users.email, `%${query}%`), like(users.username, `%${query}%`), like(users.displayName, `%${query}%`),
)) : isNull(users.deletedAt);
```

- Caller: `GET /api/v1/admin/users` (`admin/index.ts:135-148`, `zValidator('query', PaginationSchema.extend({ q: z.string().optional() }))`)
  → `service.listUsers` (`admin/service.ts:30-39`).
- Emails are stored lower-case (`EmailSchema` lower-cases on write), so `q=John@Example.com` finds
  nothing; `arda` misses `Arda`; `q=_` matches every row; whitespace-only `q` filters on `%  %`.
- **Extra finding:** `admin/service.ts:32` logs `{ page, perPage, query, requestId }`; admins search by
  email, so the email goes into the log (AGENTS.md: never log emails).
- Helpers exist: `normalizeSearchTerm` / `toContainsPattern` (`recipe/model.ts:204-223`), pure string
  functions, already tested (`recipe/model.test.ts:352-369`); also used by `recipe/service.ts:737,886`
  through `model.normalizeSearchTerm`.
- **Bigger (coordinator scope addition, verified):** every `like(`/`ilike(` call in non-test
  `apps/api/src/modules/**/model.ts` (`grep -nE "\b(i?like)\("` per file) and elsewhere in
  `apps/api/src` + `packages/db/src`:

  | Site | Function | Route (caller) | Today | Verdict |
  |---|---|---|---|---|
  | `admin/model.ts:41-43` | `listUsers` | `GET /api/v1/admin/users?q=` | `like`, unescaped | **fix** (the finding) |
  | `admin/model.ts:686-690` | `listCoffeeVarieties` (name, species, origin) | `GET /api/v1/admin/coffee-varieties?search=` (`admin/index.ts:572-577`) | `like`, unescaped | **fix** |
  | `coffee-variety/model.ts:29-37` | `findMany` (name, species, origin) | `GET /api/v1/coffee-varieties?search=` and `GET /api/v1/coffee-varieties/search?q=` (`coffee-variety/index.ts:70-90`, via `service.listCoffeeVarieties`) | `ilike` (case OK), **unescaped** | **fix** (escaping only) |
  | `equipment/model.ts:49-53` | `search` (name, brand, model; limit 10) | `GET /api/v1/equipment/search?q=` (`equipment/index.ts:67`, `service.ts:69`) | `like`, unescaped | **fix** (`hario` never finds `Hario`) |
  | `equipment/model.ts:98-103` | `findManyWithFilters` (name, brand, model) | `GET /api/v1/equipment?search=` (`service.ts:52-60`; schema `EquipmentFilterSchema.search` max 200) | `like`, unescaped | **fix** |
  | `vendor/model.ts:46` | `search` (name; limit 10) | `GET /api/v1/vendors/search?q=` (`vendor/index.ts:58`, `service.ts:31`) | `like`, unescaped | **fix** |
  | `taste/model.ts:40` | `searchByName` (limit 50) | `GET /api/v1/taste-notes/search?search=` (`taste/index.ts:48-80`, `TasteNoteFilterSchema.search` min 3; an absent term returns the flat list without calling the model; `service.ts:55-61` keeps its `QUERY_TOO_SHORT` check) | `like`, unescaped | **fix**; this is **D99.61** |
  | `user/model.ts:171` | `searchUsers` | none (dead) | `like`, unescaped | deleted under finding 34 |
  | `recipe/model.ts:274-312,595-610` | recipe search, `mainBrewer`, `author`, relevance score | recipe list/search | `ilike(col, toContainsPattern(term))` | already correct |
  | `packages/db/src/seed.ts:740` | seed taste-note lookup | seed only | `ilike(tasteNotes.name, note.name)` (exact, case-insensitive; seed names contain no `%`, `_` or `\`) | leave (not user input) |

  No other `like`/`ilike` exists in `apps/api/src` (routes, utils) or `packages/db/src`.
- Tests: `admin/model.test.ts:494-552` and `admin/service.test.ts:185-213` only use exact lower-case
  fragments. No mixed-case or metacharacter test.
- Index support: no trigram index on `user` (`packages/db/src/schema.ts` has `gin_trgm_ops` only on
  recipe title/productName/personalNotes). At the assumed load (hundreds to a few thousand users,
  admin-only, paginated, `count()` per page), a sequential scan with three `ILIKE`s is a few ms. No index;
  revisit past ~100k users (three GIN trigram indexes would be needed, one per column).

Verdict: **bigger** (siblings + PII log line).

### 2. Root cause

Wave 6 lower-cased stored emails but left the admin search on case-sensitive `like`, and the escaping
helper was written for the recipe search only.

### 3. Fix design

- Move `normalizeSearchTerm` and `toContainsPattern` unchanged (code and docblocks) to a new
  `apps/api/src/utils/search.ts` (pure, no `drizzle-orm` import, so services may import it too). Update
  `recipe/model.ts` (import), `recipe/service.ts` (import from `../../utils/search.ts` instead of
  `model.normalizeSearchTerm`), and move the `describe('normalizeSearchTerm / toContainsPattern (real
  exports)')` block from `recipe/model.test.ts:352-369` to `apps/api/src/utils/search.test.ts`; the local
  copies of the filter builder inside `recipe/model.test.ts:92,208-245` import from the new module.
  Alternative rejected: `admin/model.ts` importing `../recipe/model.ts` — works (admin/model already
  imports `../auth/model.ts`), but six modules importing the recipe model for two string helpers is the
  wrong dependency direction.
- `admin/model.ts#listUsers`:
  ```ts
  const term = normalizeSearchTerm(query);
  const pattern = term === '' ? null : toContainsPattern(term);
  const where = pattern
    ? and(isNull(users.deletedAt), or(ilike(users.email, pattern), ilike(users.username, pattern), ilike(users.displayName, pattern)))
    : isNull(users.deletedAt);
  ```
  (`ilike` is the AGENTS.md-accepted operator; escaping with `\` needs no `ESCAPE` clause because `\` is
  PostgreSQL's default LIKE escape, as the helper's docblock already states.)
- `admin/service.ts#listUsers`: log `{ page, perPage, queryLength: query?.trim().length ?? 0, requestId }`
  instead of `query`.
- **The six sibling sites get the same shared fix** (in scope per the coordinator): at each site
  `const term = normalizeSearchTerm(raw); if (term !== '') { const pattern = toContainsPattern(term); … ilike(col, pattern) … }`
  in `admin/model.ts#listCoffeeVarieties`, `coffee-variety/model.ts#findMany`, `equipment/model.ts#search`
  and `#findManyWithFilters`, `vendor/model.ts#search`, `taste/model.ts#searchByName`. For the two
  `search(query)` functions with a required `query` and `searchByName`, an empty-after-trim term returns
  `[]` without querying (today `like('%%')` returns the first 10/50 rows; the routes' validators normally
  prevent an empty `q`, so this only hardens the model). Update each docblock ("LIKE match" →
  "case-insensitive literal substring match"). Their terms are catalog names, not PII, so the existing
  `equipment`/`vendor` service debug logs of `query` may stay. Drop `like` from the `drizzle-orm` imports
  where it becomes unused.
- **D99.61 is closed by this fix** (taste-note search becomes escaped and case-insensitive with
  `ilike`, exactly its "Fix" line).

### 4. Tests

- `apps/api/src/utils/search.test.ts`: the moved helper cases (unchanged assertions).
- `apps/api/src/modules/admin/model.test.ts` `describe('listUsers')` (failing first): user with username
  `Arda<id>` and email `arda-<id>@example.com` is found by `q=ARDA<id>`, by `q=Arda-<id>@Example.com` and by
  `q='  arda<id>  '`; users `a_c<id>` and `abc<id>` → `q=a_c<id>` returns only `a_c<id>`; `q='   '` returns
  the same total as no `q`.
- `apps/api/src/modules/admin/service.test.ts`: spy `service` module logger (`vi.spyOn(<exported logger>, 'debug')`),
  call `listUsers(1, 10, 'someone@example.com')`, assert no logged argument contains `someone@example.com`
  and the start log has `queryLength: 19`. (Export the module logger if it is not exported.)
- Sibling model tests (DB-backed, failing first, each inserts its own uniquely suffixed rows and deletes
  them in `afterEach`):
  - `apps/api/src/modules/admin/model.test.ts` `listCoffeeVarieties`: variety `Bourbon<id>` found by
    `search='bourbon<id>'`; varieties `a_c<id>` / `abc<id>` → `search='a_c<id>'` returns only `a_c<id>`.
  - `apps/api/src/modules/coffee-variety/model.test.ts` `findMany`: `a_c<id>` / `abc<id>` literal `_` case
    (mixed case already works with `ilike`; add `search='100%<id>'` matching only `100%<id> Blend`, not
    `1000<id> Blend`).
  - `apps/api/src/modules/equipment/model.test.ts` `search` and `findManyWithFilters`: equipment brand
    `Hario<id>` found by `hario<id>`; `a_c<id>` / `abc<id>` literal `_`; `search('   ')` returns `[]`.
  - `apps/api/src/modules/vendor/model.test.ts` `search`: vendor `Onyx<id>` found by `onyx<id>`; literal `_`.
  - `apps/api/src/modules/taste/model.test.ts` `searchByName`: note `Fruity<id>` found by `fruity<id>`; a
    literal `%` case (`100%<id>` vs `1000<id>`) as D99.61 asks.
  - Route-level spot check: one case in `apps/api/src/modules/equipment/index.test.ts`
    (`GET /api/v1/equipment/search?q=hario<id>` returns the `Hario<id>` item).

### 5. Spec impact

`advanced-search` — MODIFIED (helper location only; rest verbatim):

````markdown
### Requirement: Search term bounds and pattern sanitization

The `search` query parameter SHALL be trimmed and limited to 200 characters by `RecipeFilterSchema`, and user-supplied `%`, `_` and `\` characters SHALL be escaped so they match literally and never act as `ilike` pattern metacharacters.

- A `search` longer than 200 characters (after trimming) SHALL be rejected with 400 and the standard validation error envelope.
- The term SHALL be normalized once by the exported pure helper `normalizeSearchTerm(raw)` in `apps/api/src/utils/search.ts` (trim only; `undefined` becomes `''`), and the `ilike` pattern SHALL be built once by the exported pure helper `toContainsPattern(term)` in the same module, which escapes with `\` (PostgreSQL's default `LIKE` escape character) in this order: `\` → `\\`, `%` → `\%`, `_` → `\_`, then wraps the result as `%<escaped>%`. The pattern is a bound parameter of Drizzle's `ilike()`, so no `ESCAPE` clause and no raw SQL is needed, and `pg_trgm` honours the escapes. That same normalized term and pattern SHALL drive search-active detection, the filter predicate and the relevance score, and the same pattern helper SHALL be used for the `mainBrewer` and `author` filters.
- A term that is empty after trimming SHALL be treated as no search: no filter, no score, and cursor pagination remains available. A term made only of metacharacters (for example `\` or `%`) is a real search for those literal characters.
- The raw search term SHALL NOT be logged on any path, including query failures; logs MAY include its length.
- The OpenAPI `search` parameter on `GET /api/v1/recipes` and `GET /api/v1/recipes/starred` SHALL declare `maxLength: 200` and describe the behaviour as a case-insensitive literal substring match on title, coffee name and personal notes, ordered by relevance.
- The web recipe-list search input SHALL set `maxLength={200}` so the UI cannot produce a 400.

#### Scenario: Over-long search is rejected

- **WHEN** the client sends `GET /api/v1/recipes` with a `search` value of 201 characters
- **THEN** the response is 400 with `error.code` `VALIDATION_ERROR` and a detail for field `search`

#### Scenario: Surrounding whitespace is ignored

- **WHEN** a public recipe is titled `Espresso Martini` and the client sends `GET /api/v1/recipes?search=%20%20espresso%20%20`
- **THEN** the recipe is returned

#### Scenario: Whitespace-only search is treated as no search

- **WHEN** the client sends `GET /api/v1/recipes?search=%20%20%20`
- **THEN** the response is 200, no search filter or score is applied, and the result equals `GET /api/v1/recipes`

#### Scenario: Underscore matches literally

- **WHEN** public recipes titled `abc` and `a_c` exist and the client sends `GET /api/v1/recipes?search=a_c`
- **THEN** the recipe titled `a_c` is returned and the recipe titled `abc` is NOT returned

#### Scenario: Percent matches literally

- **WHEN** public recipes titled `100% Arabica` and `1000 Arabica` exist and the client sends `GET /api/v1/recipes?search=100%25`
- **THEN** only `100% Arabica` is returned

#### Scenario: Backslash matches literally and never errors

- **WHEN** a public recipe has productName `C:\beans` and the client sends `GET /api/v1/recipes?search=%5C`
- **THEN** the response is 200 and contains exactly the recipes whose title, productName or personalNotes contain a backslash

#### Scenario: Pattern helper escapes in the right order

- **WHEN** `toContainsPattern('50%_\\')` is called with the five-character term `50%_\`
- **THEN** it returns the pattern `%50\%\_\\%` (each metacharacter preceded by one backslash, the backslash itself doubled)

#### Scenario: OpenAPI documents the bound

- **WHEN** `GET /api/v1/openapi.json` is fetched
- **THEN** the `search` query parameter of `GET /recipes` and `GET /recipes/starred` has `maxLength` 200
````

`advanced-search` — ADDED:

````markdown
### Requirement: Admin and catalog substring searches match literally and ignore letter case

Every free-text substring filter outside the recipe list SHALL normalise its term with `normalizeSearchTerm` and match with `ilike(<column>, toContainsPattern(term))` from `apps/api/src/utils/search.ts`, so letter case is ignored and `%`, `_` and `\` match literally.

- This covers the admin user list (`GET /api/v1/admin/users?q=`, matched against email, username and
  display name), the admin coffee-variety list (`listCoffeeVarieties` in `admin/model.ts`), the public
  coffee-variety list and search (`coffee-variety/model.ts#findMany`), the equipment search and list
  (`equipment/model.ts#search`, `#findManyWithFilters`), the vendor search (`vendor/model.ts#search`) and
  the taste-note search (`taste/model.ts#searchByName`). Plain `like()` SHALL NOT be used for
  user-supplied search terms.
- A term that is empty after trimming SHALL apply no filter in the paginated lists, and SHALL return no
  rows in the `search` functions that require a term.
- The admin user-search term SHALL NOT be logged, because admins search by email; logs MAY include its
  length.

#### Scenario: Admin user search ignores letter case

- **WHEN** user `Arda<m>` with email `arda<m>@example.com` exists and an admin lists users with `q=ARDA<m>`, and again with `q=Arda<m>@Example.com`
- **THEN** both responses contain that user

#### Scenario: Underscore in an admin search is literal

- **WHEN** users `a_c<m>` and `abc<m>` exist and an admin lists users with `q=a_c<m>`
- **THEN** only `a_c<m>` is returned

#### Scenario: The admin search term is not logged

- **WHEN** an admin lists users with `q=someone@example.com`
- **THEN** no log entry contains `someone@example.com`

#### Scenario: Catalog searches ignore letter case

- **WHEN** equipment with brand `Hario<m>`, vendor `Onyx<m>` and taste note `Fruity<m>` exist, and clients search equipment for `hario<m>`, vendors for `onyx<m>` and taste notes for `fruity<m>`
- **THEN** each search returns the matching row

#### Scenario: Catalog searches treat metacharacters literally

- **WHEN** taste notes `100%<m>` and `1000<m>` exist and a client searches taste notes for `100%<m>`, and coffee varieties `a_c<m>` and `abc<m>` exist and a client lists coffee varieties with `search=a_c<m>`
- **THEN** only `100%<m>` and only `a_c<m>` are returned
````

### 6. Docs / ledger impact

- `plans/D99-debts.md` **D99.61** (taste-note search): mark `✅ Resolved (<date>, wave-6-review-remediation)`;
  its fix is exactly this one. The resolution note should also say the same fix covered the admin
  user and coffee-variety lists, the public coffee-variety list, equipment and vendor search.
- No OpenAPI change (admin `/users` has no `describeRoute`).

### 7. Draft tasks

- [ ] R2.4 Create `apps/api/src/utils/search.ts` by moving `normalizeSearchTerm` and `toContainsPattern` (code and docblocks) out of `apps/api/src/modules/recipe/model.ts`; import them in `recipe/model.ts`, in `recipe/service.ts` (replace `model.normalizeSearchTerm`) and in `recipe/model.test.ts`; move the "real exports" block of `recipe/model.test.ts` to `apps/api/src/utils/search.test.ts`. Run `make check-api` and `make test-specific filter=src/modules/recipe` (no behaviour change).
- [ ] R2.5 Failing tests first: the `listUsers` cases of §4 in `apps/api/src/modules/admin/model.test.ts` and the no-raw-query log case in `apps/api/src/modules/admin/service.test.ts`. Run `make test-specific filter=src/modules/admin` and confirm they fail.
- [ ] R2.6 In `apps/api/src/modules/admin/model.ts#listUsers` use `normalizeSearchTerm` + `ilike(col, toContainsPattern(term))` on email, username and display name (empty term → no filter); in `admin/service.ts#listUsers` log `queryLength` instead of `query`. Update both docblocks. Re-run the admin tests until green.
- [ ] R2.7 Failing tests first: the sibling model cases of §4 in `admin/model.test.ts` (`listCoffeeVarieties`), `coffee-variety/model.test.ts`, `equipment/model.test.ts`, `vendor/model.test.ts`, `taste/model.test.ts` and the route spot check in `equipment/index.test.ts`; run `make test-specific filter=src/modules/<module>` for each and confirm they fail. Then apply `normalizeSearchTerm` + `ilike(col, toContainsPattern(term))` in `admin/model.ts#listCoffeeVarieties`, `coffee-variety/model.ts#findMany`, `equipment/model.ts#search` and `#findManyWithFilters`, `vendor/model.ts#search` and `taste/model.ts#searchByName` (empty term → no filter in lists, `[]` in the `search` functions), update their docblocks, drop unused `like` imports, re-run until green, confirm `grep -rnE "\blike\(" apps/api/src/modules --include=model.ts` returns nothing, and mark D99.61 Resolved in `plans/D99-debts.md`.

### 8. Risks / migration notes

Admins and users who relied on `_` or `%` as wildcards lose that (no UI documents it). The catalog
`search()` functions return `[]` for a whitespace-only term instead of the first 10/50 rows (unreachable
over HTTP: `SearchQuerySchema` trims `q` with `min(2)` for equipment, vendors and coffee varieties, and the
taste route never calls the model without a term). No data change, no index (catalog tables are small and the searches are
`limit`-bounded).

---

## Finding 6: parallel wrong-password requests get past `rateLimitFailures`

### 1. Verification

`apps/api/src/middleware/rateLimit.ts:213-249`: `limiter.get(key)` before the handler (`:227`), reject only
when `consumedPoints >= points` (`:228`), `await next()`, then `penalty(key)` on 401 (`:241`) or `delete`
on 2xx when `resetOnSuccess` (`:243`). Between the read and the penalty the handler runs bcrypt
(tens of ms), so N concurrent requests all read the same count.

- Callers (all in `apps/api/src/modules/auth/index.ts`, `POST /login`): `:150`
  `rateLimitFailures(POLICIES.authLoginFailIp)` (before `zValidator`), `:171-174`
  `authLoginFailAccountIp` with `resetOnSuccess: true`, `:175` `authLoginFailAccount`. No other caller
  (`grep -rn rateLimitFailures apps/api/src`). Password reset clears counters through
  `deleteRateLimitCounter` (`utils/rate-limit/registry.ts:63-71`), unaffected.
- Tests: `middleware/rateLimit.test.ts:261-375` are sequential only; `auth/index.test.ts` has sequential
  lockout tests (e.g. `:1100-1123`). No concurrency test.

Verdict: **confirmed.**

### 2. Root cause

Check-then-act across an `await next()`.

### 3. Fix design

Reserve the point atomically up front, give it back unless the attempt failed:

```ts
return async (c, next) => {
  if (!config.RATE_LIMIT_ENABLED) return next();
  const key = keyOf(c);
  if (key === null) return next();

  let limiter: RateLimiterAbstract;
  try {
    limiter = getRateLimitBackend().limiter(policy);
    await limiter.consume(key);                       // atomic reserve
  } catch (err) {
    if (err instanceof RateLimiterRes) return rejectRequest(c, policy, err);
    log.error({ err, policy: policy.id }, 'rateLimitFailures limiter failed; allowing request');
    return next();
  }

  await next();

  const status = c.res.status;
  if (isFailure(status)) return;                      // the reserved point is the failure
  try {
    if (opts.resetOnSuccess && status >= 200 && status < 300) await limiter.delete(key);
    else await limiter.reward(key);                   // success / 400 / 403 / 429 / 500 cost nothing
  } catch (err) {
    log.error({ err, policy: policy.id }, 'rateLimitFailures counter update failed');
  }
};
```

Library facts (Context7 `/animir/node-rate-limiter-flexible`, wiki "API methods"):
- `consume(key, points = 1)` resolves with `RateLimiterRes` when points are consumed and **rejects with
  `RateLimiterRes`** when there are not enough points; it rejects with an `Error` for store limiters only
  if no `insuranceLimiter` is set (ours has one, `utils/rate-limit/backend.ts:181-185`). The increment
  is atomic (Lua `rlflxIncr` on Redis, synchronous `incrby` in memory; spec "Shared-store counters are
  atomic").
- `reward(key, points = 1)` gives points back "for one duration"; `delete(key)` resolves `true/false`.
  `RateLimiterRes` has `msBeforeNext`, `remainingPoints`, `consumedPoints`, `isFirstInDuration`.
- `_reward` is `_upsert(rlKey, -points, …)` (source `lib/RateLimiterStoreAbstract.js` at v11.5.0), i.e. an
  atomic decrement.

Behaviour kept:
- Threshold identical: old code rejected when `consumedPoints >= points` before the attempt; `consume`
  rejects when the post-increment count `> points`. 5 failures allowed, the 6th rejected.
- 429 headers stay correct: `rejectRequest(c, policy, err)` gets the rejected `RateLimiterRes` (remaining 0,
  `msBeforeNext` = time to window end); failure-only policies still emit headers only on their own 429
  (`api-rate-limiting` "Rate-limited responses follow one contract"). No header on pass.
- Successful logins never burn points: consume +1, reward −1 (or delete). A 429 from an inner policy is
  status 429 for the outer failure middlewares, so they reward their point too. A handler error goes
  through `app.onError` inside Hono's compose, so `await next()` resolves with `c.res.status === 500`, and
  the point is rewarded.
- A request rejected with 429 keeps its increment (the counter can exceed `points`); windows are fixed
  (TTL set on first increment), so this does not lengthen a lockout.

Edge cases (document, accept): `reward` on a key that expired between consume and reward creates a key
at −1 (one extra attempt next window); a consume answered by the insurance limiter during a Valkey blip
followed by a reward on recovered Valkey does the same. Both are bounded to one attempt per success.

Docblocks to update: `rateLimit.ts` module docblock (`:15-18`, "`get` before the handler, `penalty`
after a failure status") and `rateLimitFailures` docblock (`:202-212`); `RateLimitMode` docblock in
`utils/rate-limit/policies.ts:16-21`.

Alternative rejected: keep `get` + `penalty` but serialise per key with an in-process mutex — breaks
across replicas and with the Redis store.

### 4. Tests

- `apps/api/src/middleware/rateLimit.test.ts` (failing first): `buildFailureApp` variant whose handler
  `await new Promise((r) => setTimeout(r, 10))` then answers 401; `Promise.all` of 10 posts on
  `smallPolicy(3, 'failures')` → handler called exactly 3 times, statuses sorted `[401×3, 429×7]`
  (today: 10 handler calls).
- Same file: 5 sequential 200s, one 400 and one 500 on `smallPolicy(2, 'failures')` → none is 429 and
  `limiter.get('acct')` has `consumedPoints: 0` (successes and non-401s return the point).
- Existing cases keep passing unchanged (walked through: "answers 429 … reaches the limit", "counts only
  401", "deletes the counter on a 2xx when resetOnSuccess", "keeps the counter on a 2xx without
  resetOnSuccess", "sets no rate-limit headers unless it answers 429", "fails open").
- `apps/api/src/modules/auth/index.test.ts` (failing first, DB-backed): `makeUser('rl-race')`, one
  `uniqueTestIp()`, `Promise.all` of 8 `postFrom(app, ip, '/auth/login', { email, password: 'wrong-password' })`
  → statuses sorted equal `[401, 401, 401, 401, 401, 429, 429, 429]` (bcrypt makes the old race visible:
  today all 8 are 401).

### 5. Spec impact

`api-rate-limiting` — MODIFIED:

````markdown
### Requirement: Login is protected per IP and per account
`POST /api/v1/auth/login` SHALL apply the `auth-login-ip`, `auth-login-fail-ip`, `auth-login-fail-account-ip` and `auth-login-fail-account` policies.

Failure-only policies SHALL reserve one point with an atomic `consume` before the handler runs and SHALL return 429 when that consume is rejected, so concurrent requests can never pass the limit together. After the handler, the reserved point SHALL stay only when the response status is 401 (invalid credentials); for every other status it SHALL be given back with `reward`, except that a 2xx login SHALL delete the `auth-login-fail-account-ip` counter for that email and IP. A request answered with 429 keeps its point. Failed attempts for email addresses that have no account SHALL be counted exactly like those for existing accounts, and the 429 body SHALL be identical in both cases, so the limiter does not reveal whether an account exists. A successful `POST /api/v1/auth/reset-password` SHALL delete both `auth-login-fail-account-ip` (for the requesting IP) and `auth-login-fail-account` counters for the account whose password was reset. That gives a locked-out owner a way back in.

#### Scenario: Five wrong passwords lock that account from that IP
- **WHEN** a client sends 5 logins with a wrong password for `alice@example.com` within 15 minutes, then a 6th with the correct password
- **THEN** the 6th request returns 429 with `Retry-After` set and does not authenticate

#### Scenario: Concurrent wrong passwords cannot pass the limit together
- **WHEN** 8 logins with a wrong password for one email are sent from one IP at the same time
- **THEN** exactly 5 of them return 401 and 3 return 429

#### Scenario: Successful and non-401 attempts do not use up the failure budget
- **WHEN** a client logs in successfully 10 times from one IP within 15 minutes and then sends 3 login requests that fail validation with 400
- **THEN** none of those requests returns 429, and the `auth-login-fail-ip` and `auth-login-fail-account` counters for that IP and email hold 0 points

#### Scenario: Another IP is not locked by the account-and-IP counter
- **WHEN** one IP has triggered `auth-login-fail-account-ip` for `alice@example.com` and a different IP logs in with the correct password
- **THEN** the login succeeds, provided `auth-login-fail-account` has not reached 20

#### Scenario: Success resets the consecutive-failure counter
- **WHEN** a client fails 4 logins for an email and then logs in successfully
- **THEN** the next 4 failed attempts from that IP for that email do not trigger 429

#### Scenario: Distributed attack on one account is capped
- **WHEN** 20 failed logins for `alice@example.com` arrive from 20 different IPs within 60 minutes
- **THEN** the 21st login attempt for that email from any IP returns 429 until the window ends

#### Scenario: Unknown emails behave like known ones
- **WHEN** a client fails 5 logins for an email with no account
- **THEN** the 6th attempt returns 429 with the same status, body and headers as for an existing account

#### Scenario: Password reset unlocks the account
- **WHEN** an account is locked by `auth-login-fail-account` and its owner completes `POST /api/v1/auth/reset-password`
- **THEN** the owner's next login with the new password succeeds
````

### 6. Docs / ledger impact

- `docs/auth.md:126-127`: "The failure-only policies take a point before the handler and give it back
  unless the login returns `401`, so parallel attempts cannot exceed the limit."
- No D99 entry. ADR-016 (`docs/decisions.md:372-405`) does not describe the get/penalty mechanics; no change.

### 7. Draft tasks

- [ ] R2.8 Failing tests first: the concurrent `Promise.all` case and the points-returned case in `apps/api/src/middleware/rateLimit.test.ts`, and the 8-concurrent-logins case in `apps/api/src/modules/auth/index.test.ts`. Run `make test-specific filter=src/middleware/rateLimit.test.ts` and `make test-specific filter=src/modules/auth/index.test.ts`; confirm the new cases fail (handler reached 10 times; eight 401s).
- [ ] R2.9 Rewrite `rateLimitFailures` in `apps/api/src/middleware/rateLimit.ts` to consume-first / reward-or-delete as in §3; update the module docblock, the `rateLimitFailures` docblock and the `RateLimitMode` docblock in `apps/api/src/utils/rate-limit/policies.ts`; update `docs/auth.md:126-127`. Re-run both test files until green.

### 8. Risks / migration notes

Counter keys and windows are unchanged, so no store migration. Under a concurrent burst the counter can
exceed `points`; harmless (fixed windows).

---

## Finding 18: rate-limit store stays `degraded` after a non-disconnect error

### 1. Verification

`apps/api/src/utils/rate-limit/backend.ts:148-201`: `degraded` is set by `client.on('error')` and by
`ObservedRateLimiterRedis._handleError` → `onStoreError` (`:135`, `:187-190`), and cleared **only** by
`client.on('ready')` (`:163-168`). A command timeout (`commandTimeout: 500`, `utils/redis/client.ts:25-30`)
or an error reply (`OOM`, `NOSCRIPT`, `BUSY`) keeps the socket up, so `ready` never fires again: `/ready`
shows `rateLimitStore: "degraded"` forever, `fallbackDecisions` keeps growing, and the next real outage
logs no new warn (`enterDegraded` returns early).

- `/ready` reads it via `getRateLimitStoreStatus()` (`registry.ts:50-53`) → `health/service.ts:170`;
  informational only (never changes 200/503, `health/service.ts:165-177`).
- Compare `FailSoftCacheProvider` (`utils/cache/failSoft.ts:111-123`): clears on the first successful
  operation.
- Tests (`backend.test.ts:120-154`) only cover the `ready`-event recovery with a dead client (`status: 'end'`).

Verdict: **confirmed.**

### 2. Root cause

Recovery is tied to a connection event, not to store health.

### 3. Fix design

Mark recovery on the first store answer, keeping the `ready` path:

```ts
/** The library's own `_getRateLimiterRes` (runs only after the store answered a call). */
const baseGetRateLimiterRes = (RateLimiterRedis.prototype as unknown as { _getRateLimiterRes: GetRes })._getRateLimiterRes;

class ObservedRateLimiterRedis extends RateLimiterRedis {
  onStoreError …                                   // unchanged
  /** Called each time the store answers consume, penalty, reward or get. */
  onStoreSuccess: () => void = () => { /* installed by the backend */ };
  _getRateLimiterRes(...args: unknown[]): RateLimiterRes {
    const res = baseGetRateLimiterRes.apply(this, args);
    this.onStoreSuccess();
    return res;
  }
}
// in createRedisBackend:
const leaveDegraded = () => {
  if (!degraded) return;
  degraded = false;
  log.info({ store: 'redis', fallbackDecisions }, 'Rate-limit store recovered');
  fallbackDecisions = 0;
};
client.on('ready', leaveDegraded);
limiter.onStoreSuccess = leaveDegraded;
```

Library facts (source `lib/RateLimiterStoreAbstract.js` at v11.5.0): every store call goes through
`_upsert` (consume/penalty/reward/block/set), `_get` or `_delete`; on success `_getRateLimiterRes` is called
for consume (inside `_afterConsume`, also when the limit is exceeded, which is still a store answer),
penalty, reward and non-null get; store failures go to `_handleError(err, funcName, resolve, reject,
[args])`, which replays on the insurance limiter (a separate `RateLimiterMemory` instance, so its
`_getRateLimiterRes` never triggers ours). `rejectIfRedisNotReady` rejects before the store, so it is not
a success. `delete` has no success hook; irrelevant (after finding 6 every limiter decision is a
`consume`, and the global policy consumes on every request).

Uses the same kind of internal override the file already relies on (`_handleError`); the version is
pinned (`"rate-limiter-flexible": "11.5.0"`), and the new test drives the real library path, so a rename
on upgrade fails the test. Alternative rejected: a 30 s time-out on the flag — no event for the recovery
log and still wrong during a long healthy period after one error.

### 4. Tests

`apps/api/src/utils/rate-limit/backend.test.ts` (failing first): a fake client with `status: 'ready'`
(connection stays up) whose `rlflxIncr` first rejects with `new Error('Command timed out')`:
1. `consume('k')` → `status()` is `degraded`, one warn.
2. `rlflxIncr.mockResolvedValue([1, 60000])`, `consume('k')` → `status()` is `ok`, one info
   `{ store: 'redis', fallbackDecisions: 1 }`.
3. `rlflxIncr` rejects again → `degraded`, a **second** warn.
Today step 2 stays `degraded` and step 3 logs nothing. The existing `ready`-event test stays.

### 5. Spec impact

`api-rate-limiting` — MODIFIED:

````markdown
### Requirement: Limiter degrades safely when the shared store is unavailable
The rate limiter SHALL NEVER turn a store failure into an HTTP 5xx or a stalled request. When the redis backend is unreachable, slow or erroring, it SHALL fall back to per-process in-memory limiting (fail-soft). If even the fallback throws, it SHALL allow the request (fail-open).

The limiter's ioredis client SHALL be created with `enableOfflineQueue: false`, `maxRetriesPerRequest: 1`, a command timeout of at most 500 ms and a connect timeout of at most 2000 ms, so a check against a dead server fails within the command timeout. `RateLimiterRedis` SHALL be configured with `rejectIfRedisNotReady: true` and an `insuranceLimiter` (`RateLimiterMemory` with the same points and duration). The limiter SHALL log `warn` once when it enters degraded mode (`{ store: 'redis', err }`), log `info` once on recovery (with the count of decisions made in degraded mode), and log `error` with `{ err, policy }` for each fail-open decision. It SHALL leave degraded mode on the first store call that succeeds after the failure, or when the client emits `ready`, whichever comes first, so a command timeout or an error reply on a live connection does not leave `/ready` reporting `degraded`; a later store failure SHALL start a new outage with its own warn. `/health` and `/ready` SHALL keep answering while Valkey is down.

#### Scenario: Valkey outage keeps the API serving and limiting
- **WHEN** the Valkey server is stopped while the API runs with `RATE_LIMIT_STORE=redis`
- **THEN** requests keep returning their normal status codes within the command timeout, a client exceeding a policy still receives 429 from the per-process fallback, and `GET /health` returns 200

#### Scenario: Degraded-mode transitions are logged once
- **WHEN** 100 requests are served during a single Valkey outage and Valkey then recovers
- **THEN** exactly one degraded-mode warn log and one recovery info log are emitted for that outage

#### Scenario: A command error on a live connection clears on the next success
- **WHEN** one limiter command times out while the Valkey connection stays up, the next command succeeds, and a later command fails again
- **THEN** the store status is `degraded` after the first failure and `ok` after the success, one recovery info log is emitted, and the second failure logs a second degraded-mode warn

#### Scenario: Fallback failure fails open
- **WHEN** both the primary and the fallback limiter throw an `Error` for a request
- **THEN** the request reaches the route handler, and an error log with `policy` and `err` (but no IP or email) is emitted
````

### 6. Docs / ledger impact

Update the `backend.ts` module docblock (":16-17 one info on recovery") and the `createRedisBackend`
docblock. No user doc change (`docs/deployment_compose.md:328-333` already says `degraded` is informational).
D99.50 (cache status) is related but separate; not closed.

### 7. Draft tasks

- [ ] R2.10 Failing test first in `apps/api/src/utils/rate-limit/backend.test.ts`: the three-step live-connection case of §4. Run `make test-specific filter=src/utils/rate-limit/backend.test.ts` and confirm step 2 fails.
- [ ] R2.11 In `apps/api/src/utils/rate-limit/backend.ts` add `onStoreSuccess` + the `_getRateLimiterRes` override to `ObservedRateLimiterRedis`, share one `leaveDegraded` between `client.on('ready')` and `onStoreSuccess`, and update the module and function docblocks. Re-run until green.

### 8. Risks / migration notes

A flapping store produces warn/info pairs per flip (same as the cache provider). None otherwise.

---

## Finding 26: `lower(col)` vs JavaScript `toLowerCase()` on non-English database locales

### 1. Verification

Helper `packages/db/src/schema.ts:36-48`: `lower(column: AnyPgColumn): SQL` → `` sql`lower(${column})` ``.
Indexes `user_email_lower_unique` / `user_username_lower_unique` on `lower(col)` (`schema.ts:123-124`).
Lookups compare `lower(col)` with a JS-lowered value:

- `auth/model.ts:72` `findUserByEmail`, `:83` `findUserByUsername` (dead, finding 34), `:196`
  `isEmailTaken`, `:214` `isUsernameTaken`;
- `admin/model.ts:75,91` (dead copies, finding 34);
- `user/model.ts:67` `findByUsername`;
- `notification/model.ts:192-196` `findMentionTargets` (`inArray(lower(users.username), usernames.map((u) => u.toLowerCase()))`);
- `packages/db/src/seed.ts:228` `findSeedUser`;
- `packages/db/src/check-identifiers.ts:143-164` groups in JS with `row[key].toLowerCase()`.

PostgreSQL `lower()` follows the collation's `LC_CTYPE`: under `tr_TR`/`az_AZ`, `lower('I')` is `ı`;
JavaScript always gives `i`. Emails and usernames are ASCII-only (`EmailSchema` pipes into `z.email()`;
`usernameRegex = /^[a-zA-Z0-9_-]+$/`, `packages/shared/src/schemas/admin.ts:4`), so on the default
`en_US`/`C.UTF-8` images the two agree. On a `tr_TR` database:

- Emails are lower-cased before storage and lookup, so Postgres sees only lower-case ASCII, which
  `lower()` leaves unchanged: **no bug** for emails (legacy mixed-case rows aside).
- Usernames keep their case. User `Ilker` → index value `ılker`; every lookup sends `ilker` → **the user
  is unreachable under any spelling** (`GET /users/Ilker` 404, `@Ilker` never notified).
- "Duplicates get past the unique index" is **not** accurate: the index itself is the authority.
  `Ilker` and `ilker` are different under `tr_TR` by the database's own rules; a JS pre-check that
  disagrees only produces a 23505, which `userIdentifierConflict` already maps to 409.
- The spec premise `unique-identifiers` line 25-26 ("JavaScript `toLowerCase()` and Postgres `lower()`
  agree" for ASCII) is false under `tr_TR` (it is the upper-case ASCII `I` that differs).

Verdict: **partly** (real but narrower and different from the review's description).

### 2. Root cause

Each side lowers with a different rule set.

### 3. Fix design

Lower both sides in SQL so lookups, pre-checks and the index always use the same function:

```ts
/** … A column or SQL expression is embedded; a string becomes a bound parameter … */
export function lower(value: AnyPgColumn | SQLWrapper | string): SQL<string> {
  // D03 raw-SQL exception: Drizzle has no lower() builder; used by the case-insensitive unique indexes and the matching lookups.
  return sql<string>`lower(${value})`;
}
```

- Call sites become `eq(lower(users.email), lower(email))`, `eq(lower(users.username), lower(username))`,
  `inArray(lower(users.username), usernames.map((u) => lower(u)))`; remove the `.toLowerCase()` calls.
  Drizzle embeds an `SQL` right operand as-is and binds plain values (`eq`/`inArray` → `bindIfParam`,
  which returns SQL wrappers unchanged); a string inside `` sql`` `` becomes a `$n` parameter.
- Index use: `lower(col) = lower($1)` matches the expression index (`lower` is IMMUTABLE and `lower($1)`
  is a per-execution constant), as does `lower(col) IN (lower($1), …)`. Proven by an EXPLAIN test.
- Parameter typing: postgres-js sends strings untyped; PostgreSQL resolves `lower(unknown)` to
  `lower(text)` (string-category preference). If a DB test ever fails with "function lower(unknown) is
  not unique", change the string branch to `` sql`lower(${value}::text)` ``.
- `check-identifiers.ts`: load `emailKey: lower(users.email)` and `usernameKey: lower(users.username)`
  (instead of `email`), and group on those keys, so the report predicts exactly what the index rejects on
  that database. `IdentifierUserRow` becomes `{ id, emailKey, username, usernameKey, deletedAt, createdAt }`;
  the raw email is no longer loaded at all (stronger privacy).
- `seed.ts#findSeedUser`: `eq(lower(users.email), lower(email))`, `eq(lower(users.username), lower(username))`.
- Emails stay lower-cased by `EmailSchema` (storage form unchanged).

Result on `tr_TR`: `Ilker` is found by `Ilker`; `ilker` stays a different account (database semantics,
consistent everywhere). Alternative rejected: index `lower(col COLLATE "C")` (locale-independent ASCII
folding, exactly JavaScript's for ASCII): needs a new migration that rebuilds both unique indexes,
changes folding for any legacy non-ASCII rows, and every lookup must repeat the collation. Worth it only
if the user wants `I`/`i` folded on Turkish-locale databases; this "nice to have" does not justify it.

### 4. Tests

- `packages/db/src/schema-lower.test.ts` (new): unit: `db.select({ id: users.id }).from(users).where(eq(lower(users.email), lower('A@B.co'))).toSQL()`
  has SQL matching `/lower\("user"\."email"\) = lower\(\$1\)/` and params `['A@B.co']`; DB-backed EXPLAIN,
  following `apps/api/src/modules/recipe/model.search.explain.test.ts` (`client.begin`, `SET LOCAL
  enable_seqscan = off`, `EXPLAIN (FORMAT JSON)` of the compiled statement): the username lookup uses
  `user_username_lower_unique` (Index Scan or Bitmap Index Scan), and the email lookup uses
  `user_email_lower_unique`.
- `apps/api/src/modules/auth/identifier.enforcement.test.ts` (new, failing first, pattern of
  `recipe/visibility.enforcement.test.ts`): read every `apps/api/src/modules/**/model.ts` plus
  `packages/db/src/seed.ts`; assert no `eq(lower(` / `inArray(lower(` whose value side is not `lower(`
  (regex such as `/(eq|inArray)\(\s*lower\([^)]*\)\s*,\s*(?!lower\(|\w+\.map\(\(\w+\)\s*=>\s*lower\()/`), and
  no `.toLowerCase()` in those lines. Fails today on 9 sites.
- Existing functional tests stay green: `auth/model.test.ts` (upper-case `isEmailTaken`/`isUsernameTaken`),
  `auth/index.test.ts` login case tests, `user` profile and mention tests.
- `packages/db/src/check-identifiers.test.ts:111-140`: rows now carry `emailKey`/`usernameKey`; groups form
  on equal keys; the "never prints an email address" test still holds.

### 5. Spec impact

`unique-identifiers` — MODIFIED ×3 (finding 34 modifies two more blocks of the same spec; all five are
listed here and under finding 34 so the assembler can merge them into one delta file).

````markdown
### Requirement: Email addresses are normalized before validation, storage and lookup

The system SHALL trim and lowercase every account email address before validating, storing or looking it up, through one shared schema, `EmailSchema = z.string().trim().toLowerCase().max(255).pipe(z.email())`, exported from `packages/shared/src/schemas/common.ts`.

- Zod 4 runs a format schema's own check before any chained `.trim()`, so `z.email().trim()`
  would reject `' a@b.co '`. The normalization therefore SHALL run on a plain string and then pipe
  into `z.email()`. The pipe stays representable by `z.toJSONSchema`, so `jsonRequestBody` keeps
  documenting the field as an email string.
- `EmailSchema` SHALL replace `z.email()` in `AuthRegisterSchema`, `AuthLoginSchema` and
  `PasswordResetSchema` (`packages/shared/src/schemas/auth.ts`), and in the admin create and update
  user schemas (`packages/shared/src/schemas/admin.ts`). The contact-form email is not an account
  identifier and SHALL stay as it is.
- Lowercasing in JavaScript before storage is safe because Zod's default email pattern accepts only
  ASCII: the stored value is already lower-case, and Postgres `lower()` leaves lower-case ASCII
  unchanged under every database locale. Lookups still lower both sides in SQL (see "Email and
  username lookups are case-insensitive"), because Postgres `lower()` of an upper-case ASCII letter
  depends on the locale (`lower('I')` is `ı` under `tr_TR`).
- `packages/db/src/seed.ts` SHALL apply the same `trim().toLowerCase()` to `ADMIN_EMAIL` before
  inserting or selecting the admin user.

#### Scenario: Registration stores a normalized email

- **WHEN** a user registers with email `  Mixed.Case@Example.COM `
- **THEN** the response is `201` and the stored `user.email` is `mixed.case@example.com`

#### Scenario: Schema normalization is unit-tested

- **WHEN** `AuthLoginSchema.parse({ email: ' A@B.CO ', password: 'x' })` and `EmailSchema.safeParse('not-an-email')` run
- **THEN** the first returns `email === 'a@b.co'` and the second fails
````

````markdown
### Requirement: Email and username uniqueness is case-insensitive at the database level

The system SHALL enforce case-insensitive uniqueness of `user.email` and `user.username` with expression unique indexes declared in `packages/db/src/schema.ts`: `uniqueIndex('user_email_lower_unique').on(lower(table.email))` and `uniqueIndex('user_username_lower_unique').on(lower(table.username))`.

- `lower(value: AnyPgColumn | SQLWrapper | string): SQL<string>` SHALL be exported from
  `packages/db/src/schema.ts` as `` sql`lower(${value})` ``, with a `// D03 raw-SQL exception:` comment
  that says Drizzle has no `lower()` builder. A column or SQL expression is embedded; a string is sent
  as a bound parameter, so a lookup can lower both sides with the database's own rules. Models import
  it from `@brewform/db/schema`. Services never import it.
- The existing exact constraints `user_email_unique` and `user_username_unique` SHALL be kept, so
  the seed's `onConflictDoNothing({ target: users.email })` keeps a matching constraint and the
  existing constraint names stay valid.
- The migration SHALL be produced only by `make db-generate` from `schema.ts` (no hand-written
  SQL). It creates both indexes inside Drizzle's single migration transaction, so if existing data
  violates an index, the whole migration rolls back and the database is unchanged (see the
  identifier-check requirement).
- Usernames keep the letter case the user chose. Only uniqueness and lookups ignore case, with the
  database's case rules: on a database whose locale lowers `I` to `ı` (`tr_TR`, `az_AZ`), `Ilker` and
  `ilker` are different identifiers.
- `citext` and other extensions SHALL NOT be used.

#### Scenario: Case variants cannot both exist

- **WHEN** two `user` rows are inserted directly through Drizzle with emails `Case<m>@example.com` and `case<m>@example.com`
- **THEN** the second insert fails with SQLSTATE `23505` on constraint `user_email_lower_unique`
- **AND** the same holds for usernames `Arda<m>` and `arda<m>` on `user_username_lower_unique`

#### Scenario: Generated migration matches the schema

- **WHEN** `make db-generate` runs after the schema change, the migration is applied with `make db-migrate`, and `make db-generate` runs again
- **THEN** the generated SQL contains `CREATE UNIQUE INDEX "user_email_lower_unique" ON "user" USING btree (lower("email"))` and the username equivalent
- **AND** the second run prints `No schema changes, nothing to migrate`
````

````markdown
### Requirement: Email and username lookups are case-insensitive

The system SHALL compare emails and usernames with `eq(lower(<column>), lower(value))` (or `inArray(lower(<column>), values.map((v) => lower(v)))`) in every identifier lookup, so the database lowers both sides with the same rules the expression unique indexes use, on any database locale, and the comparison is served by those indexes.

The lookups this requirement covers:

- `auth/model.ts`: `findUserByEmail` (login, forgot password), `isEmailTaken` and `isUsernameTaken`;
- `user/model.ts`: `findByUsername` (`GET /api/v1/users/:username`);
- `notification/model.ts`: `findMentionTargets` (comment mentions);
- `packages/db/src/seed.ts`: `findSeedUser`.

Related changes:

- `parseMentions` in `packages/shared/src/utils/mention.ts` SHALL de-duplicate usernames
  case-insensitively, keeping the first spelling seen, so `@Arda @arda` uses one of the
  `MAX_MENTIONS` slots.
- `UserProfilePage` (`apps/web/src/pages/users/UserProfilePage.tsx`) SHALL decide "this is my
  profile" by comparing the viewer's `id` with the loaded `profile.id` (for `isSelf` and in the
  loader's brews-tab check), not by comparing usernames with the URL parameter.
- Rows written before this change may hold mixed-case emails. Lookups through `lower()` find them,
  so no backfill is required.
- An enforcement test (`apps/api/src/modules/auth/identifier.enforcement.test.ts`) SHALL fail when a
  model or the seed compares `lower(<column>)` with a value that is not wrapped in `lower()`.

#### Scenario: Login ignores letter case, including legacy rows

- **WHEN** a user registered as `mixed<m>@example.com` logs in with `MIXED<m>@EXAMPLE.COM`, and a legacy row inserted directly with email `Legacy<m>@Example.com` logs in with `legacy<m>@example.com`
- **THEN** both logins return `200`

#### Scenario: Profile and mentions resolve any letter case

- **WHEN** user `Arda<m>` exists, `GET /api/v1/users/ARDA<m>` is requested, and another user comments `@arda<m> try this`
- **THEN** the profile request returns `200` with `username === 'Arda<m>'`
- **AND** `Arda<m>` receives one `mention` notification

#### Scenario: Own profile is recognised under any URL casing

- **WHEN** the signed-in user `Arda<m>` opens `/u/arda<m>?tab=brews`
- **THEN** the page treats the profile as the viewer's own and loads the brew journal

#### Scenario: Both sides are lowered in SQL and the index serves the lookup

- **WHEN** a username lookup built with `eq(lower(users.username), lower('Arda'))` is compiled and explained with sequential scans disabled
- **THEN** its SQL contains `lower("user"."username") = lower($1)` and the plan uses `user_username_lower_unique`
````

### 6. Docs / ledger impact

- `AGENTS.md:163-165` ("Case-insensitive identifiers"): `eq(lower(col), lower(value))`; add "both sides
  are lowered by the database, so lookups agree with the `_lower_unique` indexes on any locale".
- `docs/architecture.md:44` and `:181`: same wording change.
- `lint-style` raw-SQL registry (another track, finding 32): the `lower()` row must say "over a column
  or a bound value".

### 7. Draft tasks

- [ ] R2.12 Failing tests first: `packages/db/src/schema-lower.test.ts` (compile + EXPLAIN cases of §4) and `apps/api/src/modules/auth/identifier.enforcement.test.ts`. Run `make test` and confirm the enforcement test fails on the current call sites (the compile test fails type-checking until R2.13; run `make check-tests` to see it).
- [ ] R2.13 Change `lower()` in `packages/db/src/schema.ts` to `(value: AnyPgColumn | SQLWrapper | string): SQL<string>` (import `SQLWrapper` from `drizzle-orm`; update the docblock and keep the `// D03 raw-SQL exception:` comment). Rewrite the call sites to lower both sides: `auth/model.ts` (`findUserByEmail`, `isEmailTaken`, `isUsernameTaken`), `user/model.ts#findByUsername`, `notification/model.ts#findMentionTargets`, `packages/db/src/seed.ts#findSeedUser`; update the `auth/model.ts` module docblock and the touched function docblocks. Run `make check`, `make test-specific filter=src/modules/auth`, `make test-specific filter=src/modules/user`, `make test-specific filter=src/modules/notification` and `make test`.
- [ ] R2.14 In `packages/db/src/check-identifiers.ts` load `emailKey: lower(users.email)` and `usernameKey: lower(users.username)` instead of `email`, change `IdentifierUserRow` and `groupCaseInsensitiveDuplicates` to group on those keys, update the module docblock (privacy rule: the raw email is not loaded), and update `check-identifiers.test.ts`. Run `make test`.
- [ ] R2.15 Update `AGENTS.md:163-165`, `docs/architecture.md:44` and `:181` (§6).

### 8. Risks / migration notes

No data or index change. On a `tr_TR` database the behaviour for `I` changes from "unreachable" to
"reachable by its exact case"; nothing else changes on any locale.

---

## Finding 27: trailing slash in `S3_PUBLIC_URL` stores `//` in photo URLs

### 1. Verification

- `config/env.ts:199`: `S3_PUBLIC_URL: z.url().optional()` — kept verbatim.
- `utils/upload/index.ts:142-147` `getPublicUrl`: `` `${config.S3_PUBLIC_URL}/${filename}` `` (no trim).
- `utils/storage/s3.ts:86`: the driver strips one trailing `/` and `save()` returns `` `${this.publicUrl}/${key}` ``
  (`:109`), but that return value is **ignored**: `photo/service.ts:149-158` calls `saveUploadedFile` then
  `getPublicUrl(key)`, and `saveThumbnail` (`utils/upload/index.ts:177-184`) discards the driver's URL and
  calls `getPublicUrl`. Two URL builders, the used one untrimmed. With `S3_PUBLIC_URL=https://cdn.x/` the row
  stores `https://cdn.x//<uuid>.jpg` (S3/R2 resolve that as key `/<uuid>.jpg` → 404). Predates the PR
  (`git show main:apps/api/src/utils/upload/index.ts:74-78`).
- **Bigger:** `PUBLIC_APP_URL` (`env.ts:216`, `z.url().optional()`) is also kept verbatim; `appBaseUrl()`
  (`utils/notify/index.ts:98-103`) is used by `auth/email.ts:71` (reset link) and the verify link, and
  `routes/share.ts:91` builds OG URLs from it untrimmed, so a trailing slash yields
  `https://site//reset-password?token=…` (the SPA router does not match `//reset-password`). `crawler.ts:74`
  and `sitemap.ts:160` each trim it themselves (`.replace(/\/+$/, '')`). `APP_URL` (QR codes) likewise.
- Dead helpers in the same file: `getThumbnailSizes` / `THUMBNAIL_SIZES` / `ThumbnailOptions`
  (`utils/upload/index.ts:35-46,196-199`) are used only by `index.test.ts:253-285`.
- Tests: `config/env.test.ts:290-302,351`, `utils/upload/index.test.ts:195-251`, `utils/storage/s3.test.ts`,
  `modules/photo/index.s3.test.ts` (`S3_PUBLIC_URL: 'https://cdn.test'`, no slash case).

Verdict: **bigger.**

### 2. Root cause

URL bases are normalised (or not) at each use site, and the service rebuilds a URL the driver already built.

### 3. Fix design

- `config/env.ts`: one helper `const withoutTrailingSlash = (v: string) => v.replace(/\/+$/, '');`
  applied as `.transform(withoutTrailingSlash)` to `S3_PUBLIC_URL` (`z.url().transform(…).optional()`),
  `PUBLIC_APP_URL` (same) and `APP_URL` (`z.string().default(…).transform(…)`). The blank-value preprocess
  (`dropBlankValues`) runs first, so `''` stays unset. `z.url()` does not normalise the value (no
  `normalize` option used), so the transform is the single place.
- Remove the per-site trims: `s3.ts:86` `.replace(/\/$/, '')`, `crawler.ts:74` and `sitemap.ts:160`
  `.replace(/\/+$/, '')`.
- The driver becomes the only URL builder: `photo/service.ts` uses the URL `saveUploadedFile` returns (for
  the original and the thumbnail); delete `getPublicUrl` and `saveThumbnail` (now identical to
  `saveUploadedFile`) and their tests; delete the dead `THUMBNAIL_SIZES`/`ThumbnailOptions`/`getThumbnailSizes`
  and their tests. (Combined with finding 28's `saveTracked`, see below.)
- Alternative rejected: keep `getPublicUrl` as the single builder and make `StorageDriver.save` return
  `void` — more churn (both drivers, the interface, `storage.test.ts` and `s3.test.ts` assert the return
  value) and the driver is the natural owner of its URL scheme.

### 4. Tests

- `apps/api/src/config/env.test.ts` (failing first): `S3_PUBLIC_URL='https://cdn.example.com/'` →
  `'https://cdn.example.com'`; `'http://localhost:3902/brewform-uploads//'` → `'http://localhost:3902/brewform-uploads'`;
  `PUBLIC_APP_URL='https://brewform.example.com/'` → no slash; `APP_URL='http://localhost:8000/'` → no slash;
  `S3_PUBLIC_URL=''` stays `undefined` (existing case).
- `apps/api/src/modules/photo/index.s3.test.ts` (failing first): with `S3_PUBLIC_URL: 'https://cdn.test/'` in
  the test config (parse it through `envSchema` or set the normalised value the loader produces) the
  returned `url` and `thumbnailUrl` match `^https://cdn\.test/<uuid>(_medium)?\.(jpg|png)$` and contain no `//`
  after the scheme. (If the test overrides `config` directly, it must go through `reloadConfig()` so the
  transform runs.)
- `apps/api/src/modules/auth/email.test.ts`: with `PUBLIC_APP_URL='https://brewform.example.com/'`
  (via `reloadConfig()`), the reset email HTML contains `https://brewform.example.com/reset-password?token=`
  (spy `sendMail`, `APP_ENV=development` as `auth/index.test.ts:1134-1153` does).
- Update `utils/upload/index.test.ts`: delete the `getPublicUrl`, `saveThumbnail` and `getThumbnailSizes`
  cases; keep `saveUploadedFile` and `deleteStoredFile`.

### 5. Spec impact

`api-env-config` — ADDED:

````markdown
### Requirement: Public base URLs are normalised without a trailing slash

The API environment loader SHALL strip every trailing `/` from `S3_PUBLIC_URL`, `PUBLIC_APP_URL` and `APP_URL` once, at load time, and code that builds a URL from them SHALL append paths with exactly one `/` and SHALL NOT trim the values again.

- The storage driver's `save()` return value SHALL be the photo URL that is stored (the local driver
  returns `/uploads/<key>`, the S3 driver `<S3_PUBLIC_URL>/<key>`); no second URL builder exists.

#### Scenario: A trailing slash in S3_PUBLIC_URL does not reach photo URLs

- **WHEN** the API starts with `STORAGE_DRIVER=s3` and `S3_PUBLIC_URL=https://cdn.example.com/`, and the recipe owner uploads a photo with a thumbnail
- **THEN** `config.S3_PUBLIC_URL` is `https://cdn.example.com` and the stored `url` and `thumbnailUrl` are `https://cdn.example.com/<uuid>.<ext>` and `https://cdn.example.com/<uuid>_medium.<ext>`

#### Scenario: A trailing slash in PUBLIC_APP_URL does not break email links

- **WHEN** the API runs with `PUBLIC_APP_URL=https://brewform.example.com/` and a password reset email is sent
- **THEN** the link in the email starts with `https://brewform.example.com/reset-password?token=`
````

`model-test-coverage` — MODIFIED (only the `upload/index.ts` row changes):

````markdown
### Requirement: Tier 2 API util tests follow the established util-test pattern

The following 4 API utils SHALL have a co-located test file:

| Util | Test file | Pattern reference |
|---|---|---|
| `apps/api/src/utils/jobs/cron.ts` | `apps/api/src/utils/jobs/cron.test.ts` | New — assert schedule registration, job execution |
| `apps/api/src/utils/openapi/index.ts` | `apps/api/src/utils/openapi/index.test.ts` | New — schema conversion smoke (z.toJSONSchema produces valid output) |
| `apps/api/src/utils/upload/index.ts` | `apps/api/src/utils/upload/index.test.ts` | `bodyLimit.test.ts` (which exercises the photo body cap) — cover `validateImagePart`, `generateStorageKey`, `thumbnailKey`, `saveUploadedFile`, `deleteStoredFile` (wave 6 replaced `validateImageUpload`, `generateFilename` and `generateThumbnailFilename`, and the wave-6 review removed `getPublicUrl`, `saveThumbnail` and `getThumbnailSizes`; see `photo-upload-security` and `api-env-config`) |
| `apps/api/src/middleware/requestId.ts` | `apps/api/src/middleware/requestId.test.ts` | `bodyLimit.test.ts` pattern (stub Hono app + `app.request()`) — assert header is read/generated and attached to context |

**Path correction:** The D39 plan says `apps/api/src/jobs/cron.ts` but the actual path is
`apps/api/src/utils/jobs/cron.ts` (the `apps/api/src/jobs/` directory does not exist).

**Reason:** These 4 utils have no dedicated test. `upload/index.ts` is partially exercised by
`bodyLimit.test.ts` but most of its functions are untested. `requestId.ts` is a thin wrapper but
the plan lists it.

#### Scenario: 4 new util test files exist

- **WHEN** `ls apps/api/src/utils/jobs/cron.test.ts apps/api/src/utils/openapi/index.test.ts apps/api/src/utils/upload/index.test.ts apps/api/src/middleware/requestId.test.ts` is run
- **THEN** all 4 files exist

#### Scenario: Util tests pass

- **WHEN** `make test-api` is run
- **THEN** all 4 new util test files pass with zero failures
````

### 6. Docs / ledger impact

- `apps/api/.env.example:143-149` and `.env.production.example:55`: add "(a trailing slash is ignored)".
- `docs/deployment_compose.md` and `docs/deployment_coolify.md` troubleshooting: one note for operators who
  ran with a trailing-slash `S3_PUBLIC_URL`: photos uploaded then are stored with `//` and can be repaired
  once in `psql` with `UPDATE photo SET url = replace(url, '<base>//', '<base>/'), thumbnail_url =
  replace(thumbnail_url, '<base>//', '<base>/') WHERE url LIKE '<base>//%';` (operator SQL, not app code).
- `docs/decisions.md:211`: "The backend's `saveThumbnail()` falls back" → "The photo service
  (`uploadPhoto`) falls back".
- No OpenAPI change.

### 7. Draft tasks

- [ ] R2.16 Failing tests first: the env cases in `apps/api/src/config/env.test.ts`, the trailing-slash S3 case in `apps/api/src/modules/photo/index.s3.test.ts` and the reset-link case in `apps/api/src/modules/auth/email.test.ts` (§4). Run `make test-specific filter=src/config/env.test.ts`, `make test-specific filter=src/modules/photo/index.s3.test.ts` and `make test-specific filter=src/modules/auth/email.test.ts`; confirm they fail.
- [ ] R2.17 In `apps/api/src/config/env.ts` add the `withoutTrailingSlash` transform to `S3_PUBLIC_URL`, `PUBLIC_APP_URL` and `APP_URL` (update the env comment block); remove the trims in `utils/storage/s3.ts:86`, `middleware/crawler.ts:74` and `routes/sitemap.ts:160`. In `apps/api/src/utils/upload/index.ts` delete `getPublicUrl`, `saveThumbnail`, `THUMBNAIL_SIZES`, `ThumbnailOptions` and `getThumbnailSizes` (and their cases in `index.test.ts`); in `apps/api/src/modules/photo/service.ts` use the URL returned by the save (see R2.19). Update `docs/decisions.md:211`, the two `.env` examples and both deployment guides (§6). Re-run the R2.16 tests and `make test-specific filter=src/utils/upload` until green.

### 8. Risks / migration notes

Existing rows keep any `//` they were stored with; the docs note gives the one-off repair. `APP_URL`
values with a trailing slash produce the same QR/OG URLs minus the double slash (an improvement).

---

## Finding 28: a failed storage write leaves a partial file behind

### 1. Verification

`photo/service.ts:147-160`: `written.push(key)` runs **after** `await saveUploadedFile(…)` and
`written.push(thumbKey)` after `await saveThumbnail(…)`. A write that throws is never cleaned up:

- local: `writeFile(target, data, { flag: 'wx' })` (`utils/storage/local.ts:34`) creates the file first, so
  `ENOSPC`/`EIO` mid-write leaves a truncated file;
- S3: a PUT that timed out on our side (`AbortSignal.timeout(30_000)`, `s3.ts:182`) may still have been
  stored.

Deleting a missing key is harmless (`local.ts:44-52` uses `rm(…, { force: true })`; S3 `DELETE` of a missing
key is 204). **Edge the fix must respect:** a local write that fails with `EEXIST` did not create anything —
that file belongs to another upload, and `photo-upload-security` "Uploads never overwrite an existing
object" forbids touching it (UUIDv4 keys make this practically impossible, but cleanup must not turn it
into a delete).

Tests: `photo/service.test.ts:282-334` (`installFailingDriver`: second save rejects, asserts
`expect(deleted).toEqual(saved)`, i.e. only the original is deleted).

Verdict: **confirmed.**

### 2. Root cause

The cleanup list records completed writes, not attempted ones.

### 3. Fix design

One helper in `photo/service.ts` (also absorbs finding 27's "use the driver's URL"):

```ts
/**
 * Save one object, recording its key for cleanup before the write (a failed write can leave a
 * partial file or a stored S3 object). An `EEXIST` failure is un-recorded: that object belongs to
 * another upload and must never be deleted.
 */
async function saveTracked(written: string[], data: Uint8Array, key: string, mime: SupportedImageMime): Promise<string> {
  written.push(key);
  try {
    return await saveUploadedFile(data, key, mime);
  } catch (err) {
    if ((err as { code?: unknown } | null)?.code === 'EEXIST') written.pop();
    throw err;
  }
}
// uploadPhoto:
const url = await saveTracked(written, file.data, key, image.mime);
let thumbnailUrl = url;
if (thumbnailPart && thumbnailImage) {
  thumbnailUrl = await saveTracked(written, thumbnailPart.data, thumbnailKey(id, thumbnailImage.mime), thumbnailImage.mime);
}
```

Alternatives rejected: driver-level self-cleanup (local `rm` on failure + S3 best-effort `DELETE` inside
the retry loop) — more code in two drivers, and an S3 delete during an outage adds its own 4-attempt
backoff to the failing request.

### 4. Tests

`apps/api/src/modules/photo/service.test.ts` `describe('uploadPhoto partial-write cleanup')`:
- **Failed write's own key is deleted** (failing first): fake driver whose first `save` rejects with
  `new Error('ENOSPC')` → `deleted` equals `[<original key>]`, no row.
- **Thumbnail failure deletes both keys** (failing first; replaces the old expectation): second save rejects →
  `deleted` equals `[<original key>, <thumbnail key>]`.
- **EEXIST is never deleted**: first save rejects with `Object.assign(new Error('exists'), { code: 'EEXIST' })`
  → `deleted` is empty, error rethrown (500 path).
- Update "still surfaces the original error when the cleanup delete also fails" to the two-key expectation.

### 5. Spec impact

`photo-upload-security` — MODIFIED:

````markdown
### Requirement: Best-effort cleanup of partially persisted uploads

When a storage write or the photo row insert fails, the system SHALL attempt a best-effort `delete`, through the storage driver, of every object key it tried to write for the same upload, including the key whose write failed (a failed local write can leave a partial file, and a timed-out S3 PUT can still have stored the object), and SHALL log a `warn` if the cleanup fails, while still surfacing the original failure to the global error handler.

A key whose write failed with `EEXIST` SHALL NOT be deleted, because that object belongs to another upload (see "Uploads never overwrite an existing object").

#### Scenario: Thumbnail write failure removes both objects

- **WHEN** the original is written successfully and the thumbnail write throws
- **THEN** the driver's `delete` is called with the original's key and with the thumbnail's key
- **AND** the client receives HTTP 500 `INTERNAL_ERROR` and no photo row exists

#### Scenario: A failed write's own key is cleaned up

- **WHEN** the original write throws (for example `ENOSPC` after part of the file was written)
- **THEN** the driver's `delete` is called with the original's key and no photo row exists

#### Scenario: An existing object is never deleted by cleanup

- **WHEN** the original write fails with `EEXIST`
- **THEN** the driver's `delete` is not called with that key and the client receives HTTP 500 `INTERNAL_ERROR`

#### Scenario: Cleanup failure is logged, not masked

- **WHEN** the photo row insert fails and the subsequent cleanup `delete` also throws
- **THEN** a `warn` log records the cleanup failure with the key and `requestId`
- **AND** the client still receives HTTP 500 `INTERNAL_ERROR`
````

### 6. Docs / ledger impact

`uploadPhoto` docblock (`photo/service.ts:103-125`): "the objects already written or attempted (except
an `EEXIST` key) are deleted". No user doc.

### 7. Draft tasks

- [ ] R2.18 Failing tests first in `apps/api/src/modules/photo/service.test.ts`: the own-key, both-keys and `EEXIST` cases of §4 (update the two existing cleanup cases to the new expectations). Run `make test-specific filter=src/modules/photo/service.test.ts`; confirm the own-key and both-keys cases fail.
- [ ] R2.19 Add `saveTracked` to `apps/api/src/modules/photo/service.ts` as in §3, use its return values as `url`/`thumbnailUrl` (no `getPublicUrl`, no `saveThumbnail`), update the `uploadPhoto` docblock. Re-run the photo service, `photo/index.test.ts` and `photo/index.s3.test.ts` until green.

### 8. Risks / migration notes

None. Orphans left by past failures stay (no sweeper; out of scope).

---

## Finding 34 (part): dead identifier helpers and stale setup log lines

### 1. Verification

- No production caller (`grep -rn` over `apps/api/src packages`): `admin/model.ts:69-99`
  `isEmailTaken`/`isUsernameTaken` (tests `admin/model.test.ts:555-640`); `auth/model.ts:78-86`
  `findUserByUsername` (tests `auth/model.test.ts:149-167`); `user/model.ts:160-191` `searchUsers` (no tests).
  `auth/model.ts` `isEmailTaken`/`isUsernameTaken` **are** used (`auth/service.ts:111,120`) and stay.
- Admin create/update rely on the failed insert/update: `admin/model.ts:164-167` `throwIfUniqueViolation`
  maps the `23505` (caught outside the transaction, so no aborted-transaction reuse) to
  `EMAIL_ALREADY_EXISTS`/`USERNAME_ALREADY_EXISTS` → 409 (`admin/index.ts:157-173`).
- Spec contradiction: `unique-identifiers` "Identifiers of soft-deleted accounts stay reserved and conflicts
  map to 409" says "The availability checks `isEmailTaken` and `isUsernameTaken` (auth **and admin** models) …
  registration **and admin writes** SHALL answer a taken identifier with `409` … instead of relying on a
  failed insert". Admin writes do rely on the failed write.
- Setup logs: `setup/service.ts:51-53` (`createSetup clearing defaults for user`), `:93-95` (`updateSetup …`),
  `:154` (`setDefault clearing defaults for user`) describe a `clearDefaultForUser` call that no longer exists
  (the model clears the old default inside its transaction). Asserted by `setup/service.test.ts:108-125`,
  `:164-176`, `:261-274` (`toHaveBeenCalledTimes(3)` + the message). **Also required by spec**:
  `api-service-logging` "Cache-aware functions log cache interactions" (scenario "Default-clearing side
  effect in setup service is logged") and "Services with async side effects log the side effect execution"
  (two setup scenarios naming `model.clearDefaultForUser`).

Verdict: **confirmed.**

### 2. Root cause

Wave 6 converted the helpers to case-insensitive but the callers had already gone; the setup refactor
moved the default switch into the model without removing the logs or the spec scenarios.

### 3. Fix design

- **Delete** `admin/model.ts#isEmailTaken`, `#isUsernameTaken`, `auth/model.ts#findUserByUsername`,
  `user/model.ts#searchUsers` and their tests (drop imports that become unused: `ne`, `lower`, `like`, … as
  `make check`/`make lint` report). Reword the spec: registration pre-checks; admin writes map the unique
  violation. **Alternative (user decision):** wire the admin checks into `adminCreateUser`/`adminUpdateUser`
  to keep the spec text. Trade-off: with the delete, every refused admin write reaches Postgres, whose
  server log records the failed statement with `DETAIL: Key (lower(email))=(…) already exists` (an email in
  the Postgres container log; registration's race fallback has the same property). Recommended: delete
  (smaller, review's lean advice; admin writes are rare and admin-only).
- Delete the three setup debug lines (and the `if (data.isDefault)` wrappers around the first two); the
  tests drop to 2 debug calls (`started`, `completed`). MODIFY the two `api-service-logging` requirements.

### 4. Tests

- Remove `describe('isEmailTaken')` / `describe('isUsernameTaken')` from `admin/model.test.ts` and
  `describe('findUserByUsername')` from `auth/model.test.ts`. The "Admin rename to a case variant" behaviour
  stays covered by the admin route tests (409 via `throwIfUniqueViolation`; keep `admin/model.test.ts:680-730`).
- `setup/service.test.ts`: rename the three tests ("should log entry/exit when …"), expect
  `toHaveBeenCalledTimes(2)` with the `started`/`completed` calls, and keep the single-default assertions.

### 5. Spec impact

`unique-identifiers` — MODIFIED (×2, merge with finding 26's three blocks):

````markdown
### Requirement: Identifiers of soft-deleted accounts stay reserved and conflicts map to 409

The system SHALL treat the email and username of a soft-deleted account as taken. The availability checks `isEmailTaken` and `isUsernameTaken` in `apps/api/src/modules/auth/model.ts` SHALL NOT filter `deletedAt`, so that they agree with the global unique indexes, and registration SHALL answer a taken identifier with `409` and the existing messages before it reaches the user insert. Admin create and update SHALL rely on the unique indexes: the `23505` of their insert or update SHALL map to `409` with the existing admin messages.

- This is a deliberate exception to the soft-delete filtering rule. Each function's docblock, and
  the `auth/model.ts` module docblock (which says every user query filters soft-deletes), SHALL
  state the exception and the reason: the unique indexes cover soft-deleted rows, and keeping a
  deleted account's username reserved stops a new account from inheriting its old profile links and
  mentions.
- A `23505` from the registration insert is only a race fallback; for admin create and update it is
  the normal conflict path. It SHALL map to `EMAIL_ALREADY_EXISTS` for `user_email_unique` or
  `user_email_lower_unique`, and to `USERNAME_ALREADY_EXISTS` for `user_username_unique` or
  `user_username_lower_unique`, through `isUniqueViolation`. The constraint names SHALL be exported as
  `USER_EMAIL_CONSTRAINTS` and `USER_USERNAME_CONSTRAINTS` from `apps/api/src/modules/auth/model.ts`
  and reused by `admin/model.ts#throwIfUniqueViolation`.
- Statuses and messages: registration returns `409 CONFLICT` with `Email already registered` or
  `Username already taken`. Admin create and update keep their existing `409` messages. Login with
  a deleted account's email stays `401 INVALID_CREDENTIALS`. Forgot-password for it stays a silent
  `200`.
- Freeing a self-deleted account's email (tombstoning it on deletion) is NOT part of this change.
  It belongs to the deferred account-deletion anonymisation work.

#### Scenario: Re-registration with a deleted account's identifiers returns 409

- **WHEN** account `Del<m>` with email `del<m>@example.com` is soft-deleted, and new registrations then use `DEL<m>@Example.com` (new username), and username `del<m>` (new email)
- **THEN** the responses are `409` with `Email already registered` and `409` with `Username already taken`
- **AND** neither request reaches the user insert (no `Database constraint violation` warn line is logged)

#### Scenario: Concurrent registrations differing only in case

- **WHEN** two registrations with usernames `Race<m>` and `race<m>` (and different emails) run concurrently
- **THEN** one returns `201` and the other returns `409` with `Username already taken`, never `500`

#### Scenario: Admin rename to a case variant of another user is refused

- **WHEN** an admin changes user B's username to `ARDA<m>` while user A holds `Arda<m>`
- **THEN** `PATCH /api/v1/admin/users/:id` responds `409` with `error.message === 'Username is already taken by another user.'`
````

````markdown
### Requirement: Identifier conflicts are detected and remediated before stricter constraints apply

The system SHALL ship an operator script, `packages/db/src/check-identifiers.ts`, that reports existing data violating the stricter constraints of this change and offers opt-in, transactional fixes. It SHALL be guarded by `if (import.meta.main)`, run under `node` (as `check-users-empty.ts` does), and be exposed as `make db-check-identifiers`.

- Pure, unit-tested functions SHALL do the grouping over plain row arrays:
  `groupCaseInsensitiveDuplicates(rows, key)` for `email` and `username`, and
  `findMultipleDefaults(rows)` for setups. Case duplicates SHALL be grouped on keys lowered by the
  database (`lower(email)` and `lower(username)`, loaded through the `lower()` helper), so the report
  matches what the expression indexes reject on that database's locale. The script loads only `id`,
  `lower(email)`, `username`, `lower(username)`, `deletedAt` and `createdAt` from `user` (never the raw
  email), `id`, `userId` and `updatedAt` from active default setups, and `id` from recipes whose slug
  is `''`.
- The report SHALL print counts, user ids and usernames (usernames are public), and SHALL NEVER
  print email addresses. It SHALL exit `1` when a blocking issue exists (email or username case
  duplicates, multiple active defaults), and `0` otherwise. Empty legacy slugs are reported as a
  non-blocking warning.
- Opt-in fixes, each in its own transaction, printing the affected ids:
  - `--fix-deleted-duplicates`: for each duplicate group, rewrite only the soft-deleted members to
    `email = deleted+<id>@deleted.invalid` and `username = deleted-<first 12 hex characters of id
    without dashes>`. Soft-deleted accounts cannot sign in, and their profiles already answer `404`.
  - `--fix-setup-defaults`: keep the most recently updated default per user and set `is_default =
    false` on the others.
  - `--fix-empty-slugs`: give each recipe with `slug = ''` a slug from `slugCandidates('', …)`,
    trying the next candidate on a unique violation.
- Groups of two or more ACTIVE accounts SHALL NOT be changed automatically. The script SHALL print
  the remediation: an admin renames all but one account's username, or changes its email, through
  `PATCH /api/v1/admin/users/:id`, after contacting the owner.
- The upgrade notes in `docs/deployment_coolify.md` SHALL tell operators to run the check before
  deploying this release, with the exact production command
  (`docker compose -f compose.production.yml run --rm -w /app/packages/db --entrypoint node api src/check-identifiers.ts`).
  They SHALL also say that a failed migration leaves the database unchanged.

#### Scenario: Clean database passes

- **WHEN** `make db-check-identifiers` runs against the migrated `brewform_test` database
- **THEN** it exits `0` and prints `0` for every blocking category

#### Scenario: Grouping finds case duplicates without leaking emails

- **WHEN** `groupCaseInsensitiveDuplicates` receives three rows whose database-lowered email keys are `a@x.io` (active), `a@x.io` (soft-deleted) and `b@x.io`, and the report formatter renders the result
- **THEN** one group with the first two ids is returned, its soft-deleted member is marked fixable, and the rendered report does not contain `a@x.io`

#### Scenario: Multiple defaults are found and fixed

- **WHEN** `findMultipleDefaults` receives two active default setups for one user with different `updatedAt`
- **THEN** it returns that user with the older setup id listed for clearing
````

(The `check-identifiers` block belongs to finding 26; it is shown here once.)

`api-service-logging` — MODIFIED ×2:

````markdown
### Requirement: Cache-aware functions log cache interactions

Service functions that read from or write to a cache SHALL include cache hit/miss state in their debug logs, and SHALL log debug messages around cache invalidation calls.

#### Scenario: Cache read includes hit/miss in log

- **WHEN** `getHierarchy(cache)` reads from cache and gets a hit
- **THEN** the system SHALL emit `log.debug({ cached: true }, 'getHierarchy completed')` on exit

#### Scenario: Cache flush after mutation is logged

- **WHEN** `createTasteNote(data, cache)` successfully creates a taste note
- **THEN** the system SHALL emit `log.debug({ name }, 'flushing taste note cache after create')` before calling `flushCache(cache)`
````

````markdown
### Requirement: Services with async side effects log the side effect execution

Service functions that trigger async side effects such as `flushCache` (taste service) SHALL emit a `log.debug` call immediately before executing each side effect, and SHALL include relevant identifiers in the log context. Work that a model performs inside its own transaction (for example the setup default switch in `setup/model.ts`) is not a service side effect and SHALL NOT get a separate service log line.

#### Scenario: createTasteNote logs the cache flush side effect

- **WHEN** `createTasteNote(data, cache)` successfully inserts a new taste note
- **THEN** the system SHALL emit `log.debug({ name: data.name }, 'flushing taste note cache after create')` before calling `flushCache(cache)`

#### Scenario: updateTasteNote logs the cache flush side effect

- **WHEN** `updateTasteNote(id, data, cache)` successfully updates a taste note
- **THEN** the system SHALL emit `log.debug({ id }, 'flushing taste note cache after update')` before calling `flushCache(cache)`

#### Scenario: deleteTasteNote logs the cache flush side effect

- **WHEN** `deleteTasteNote(id, cache)` successfully soft-deletes a taste note
- **THEN** the system SHALL emit `log.debug({ id }, 'flushing taste note cache after delete')` before calling `flushCache(cache)`

#### Scenario: flushCache itself logs entry and exit

- **WHEN** `flushCache(cache)` (the private function in taste service) is called
- **THEN** the system SHALL emit `log.debug({}, 'flushCache started')` on entry
- **AND** SHALL emit `log.debug({}, 'flushCache completed')` on exit after all cache keys are deleted

#### Scenario: Setup default switch logs only entry and exit

- **WHEN** `setDefault(userId, id)` succeeds
- **THEN** the setup service emits exactly the `setDefault started` and `setDefault completed` debug logs
````

### 6. Docs / ledger impact

`docs/architecture.md:42-46` still names the auth-model checks (unchanged). No D99 entry.

### 7. Draft tasks

- [ ] R2.20 Delete `isEmailTaken` and `isUsernameTaken` from `apps/api/src/modules/admin/model.ts`, `findUserByUsername` from `apps/api/src/modules/auth/model.ts` and `searchUsers` from `apps/api/src/modules/user/model.ts`, with their test blocks in `admin/model.test.ts` and `auth/model.test.ts`; remove imports that become unused. Run `make check-api`, `make lint` and `make test-specific filter=src/modules/admin`, `…/auth`, `…/user`.
- [ ] R2.21 Delete the three "clearing defaults" debug lines in `apps/api/src/modules/setup/service.ts` (and the `if (data.isDefault)` wrappers of the first two); update the three tests in `setup/service.test.ts` to two debug calls and rename them. Run `make test-specific filter=src/modules/setup`.

### 8. Risks / migration notes

None.

---

## Finding "Not checked": failed auth/admin emails log the raw nodemailer error

### 1. Verification

Raw `err` logged on every mail path; pino serialises it with `pino.stdSerializers.err`
(`utils/logger/index.ts:12-14`), which copies every enumerable own property; redaction covers only
`passwordHash/password/token/secret/apiKey/authorization` (`:11`).

| Site | Line | Note |
|---|---|---|
| `auth/email.ts` `sendEmail` | `:40-43` `logger.error({ err, delivery: 'failed', subject })`, then rethrow | welcome, reset, verify |
| `auth/service.ts` register | `:134-138` `logger.warn({ err }, 'Failed to send verification email')` | also catches DB errors from `createEmailVerificationToken` (Drizzle message with params) |
| `auth/service.ts` requestPasswordReset | `:247-252` `logger.error({ err }, …)` | |
| `admin/service.ts` adminCreateUser | `:116-120` `logger.warn({ err }, 'Failed to send welcome email on admin create')` | |
| `utils/notify/index.ts` `sendEmail` | `:86-91` `logger.error({ err, delivery: 'failed', subject })` | notification emails; never rethrows |
| `contact/index.ts` | `:69-80` `logger.error({ err }, 'Failed to send contact email')` | recipient = `ADMIN_EMAIL` |

`notification/service.ts:148,226,299,391` catch errors from the `notifyX` helpers, whose `sendEmail` never
throws, so they only see DB lookup errors (see Cross-track notes).

nodemailer 10.4.0 facts (Context7 `/websites/nodemailer` "Error reference": properties `message`,
`code`, `command`, `response` ("the raw response string from the SMTP server"), `responseCode`,
`originalCode`, `timeoutType`; EENVELOPE "check the `rejected` and `rejectedErrors` arrays … only attached
when every recipient was rejected"; source `src/smtp-connection/index.ts` at v10.4.0): `_formatError` sets
`err.response = response` and **`err.message += ': ' + response`**; `_actionRCPT` sets
`err.recipient = curRecipient` on each per-recipient error; `_envelopeError` sets
**`err.rejected = envelope.rejected`** (addresses) and **`err.rejectedErrors`**. SMTP rejection replies
typically echo the address (`550 5.1.1 <a@b.c>: Recipient address rejected`). So the address can appear in
`rejected`, `rejectedErrors[].recipient`, `response`, `message` and the first line of `stack`.

The existing `toLoggableError` (`utils/errors.ts:283-286`) drops unknown properties but keeps `message` and
rebuilds `stack` with the message header, so it is not enough for mail errors.

Verdict: **confirmed.**

### 2. Root cause

Mail errors were treated as ordinary errors; nodemailer's are not PII-free.

### 3. Fix design

Add to `apps/api/src/utils/errors.ts`:

```ts
/** A log-safe copy of an email-send failure (see {@link toLoggableMailError}). */
export interface LoggableMailError { type: string; code?: string; command?: string; responseCode?: number; stack?: string; }

/**
 * Log-safe copy of any error caught around an email send. Database errors go through
 * {@link toLoggableError}. Anything else keeps only `type`, `code`, `command`, `responseCode` and the
 * stack frames (header = type): nodemailer appends the SMTP reply to `message` and attaches `response`,
 * `rejected` and `rejectedErrors[].recipient`, which carry recipient addresses.
 */
export function toLoggableMailError(err: unknown): LoggableError | LoggableMailError {
  if (isDatabaseError(err)) return toLoggableError(err);
  if (!isObjectLike(err)) return { type: typeof err };
  const type = typeof err.name === 'string' ? err.name : 'Error';
  const result: LoggableMailError = { type };
  if (typeof err.code === 'string') result.code = err.code;
  if (typeof err.command === 'string') result.command = err.command;
  if (typeof err.responseCode === 'number') result.responseCode = err.responseCode;
  const stack = sanitizeStack(err.stack, type);
  if (stack !== undefined) result.stack = stack;
  return result;
}
```

Use `{ err: toLoggableMailError(err) }` at all six sites. `code` + `command` + `responseCode` are enough to
diagnose (`EAUTH`/535 credentials, `ECONNECTION`/`CONN` network, `EENVELOPE`/`RCPT TO`/550 recipient
refused). Export each touched module logger as `log`/`logger` with a docblock so tests can spy on it.

Alternative rejected: extend `toLoggableError` to drop `message` for SMTP-looking errors — implicit, and
would change the DB-error contract that the `error-handling` spec pins.

### 4. Tests

- `apps/api/src/utils/errors.test.ts` (failing first, the function does not exist): an EENVELOPE-shaped error
  (`message` with `<victim@example.com>`, `response`, `rejected: ['victim@example.com']`, `rejectedErrors`
  with `recipient`, `code: 'EENVELOPE'`, `command: 'RCPT TO'`, `responseCode: 550`) →
  `toLoggableMailError` equals `{ type: 'Error', code: 'EENVELOPE', command: 'RCPT TO', responseCode: 550, stack: expect.any(String) }`
  and `JSON.stringify` of it does not contain `victim@example.com`; a Drizzle-wrapped Postgres error returns
  exactly `toLoggableError(err)`; a string throw returns `{ type: 'string' }`.
- `apps/api/src/modules/auth/email.test.ts` (failing first): `APP_ENV=development` + `reloadConfig()`, spy
  `getTransporter().sendMail` rejecting with the EENVELOPE shape, call `sendWelcomeEmail('victim@example.com', 'v')`,
  expect rejection; spy the exported module logger's `error`, assert no call argument serialises to a string
  containing `victim@example.com`; restore `APP_ENV=test` in `finally` (pattern of `auth/index.test.ts:1134-1153`).
- `apps/api/src/modules/contact/contact.test.ts`: same idea for the contact route (500 response, safe log).

### 5. Spec impact

`error-handling` — ADDED:

````markdown
### Requirement: Email send failures are logged without recipient addresses

Every log entry for a failed email send, and for any error caught around one, SHALL pass the error through `toLoggableMailError` from `apps/api/src/utils/errors.ts`, which keeps only the error name, `code`, `command`, `responseCode` and the stack frames for mail errors (database errors go through `toLoggableError`), because nodemailer puts recipient addresses into `message`, `response`, `rejected` and `rejectedErrors[].recipient`.

- This covers `apps/api/src/modules/auth/email.ts`, the verification and password-reset catches in
  `auth/service.ts`, the welcome-email catch in `admin/service.ts`, the notification `sendEmail` in
  `apps/api/src/utils/notify/index.ts` and the contact route.

#### Scenario: A rejected recipient does not reach the logs

- **WHEN** the SMTP server rejects every recipient of a welcome email to `victim@example.com` (nodemailer `EENVELOPE` with `rejected: ['victim@example.com']` and the reply `550 5.1.1 <victim@example.com>` in its message)
- **THEN** the error log entry has `code: 'EENVELOPE'`, `command: 'RCPT TO'` and `responseCode: 550`
- **AND** no log entry contains `victim@example.com`

#### Scenario: Database errors keep the database-safe shape

- **WHEN** the verification-token insert fails during registration with a Drizzle-wrapped Postgres error
- **THEN** the warn log carries the same `err` object `toLoggableError` produces (no query parameters)
````

### 6. Docs / ledger impact

`docs/logging.md`: one line under the PII rules ("email-send errors go through `toLoggableMailError`").
AGENTS.md "Logging → Rules": extend the `toLoggableError` bullet with "and email-send errors through
`toLoggableMailError` (nodemailer errors carry recipient addresses)". No D99 entry.

### 7. Draft tasks

- [ ] R2.22 Failing tests first: the `toLoggableMailError` cases in `apps/api/src/utils/errors.test.ts`, the welcome-email log case in `apps/api/src/modules/auth/email.test.ts` and the contact case in `apps/api/src/modules/contact/contact.test.ts`. Run `make test-specific filter=src/utils/errors.test.ts`, `…/src/modules/auth/email.test.ts`, `…/src/modules/contact/contact.test.ts`; confirm they fail.
- [ ] R2.23 Add `LoggableMailError` and `toLoggableMailError` to `apps/api/src/utils/errors.ts` (docblocks); use `{ err: toLoggableMailError(err) }` in `auth/email.ts:41`, `auth/service.ts:137` and `:250`, `admin/service.ts:119`, `utils/notify/index.ts:90` and `contact/index.ts:79`; export the touched module loggers with docblocks where a test spies on them. Update `docs/logging.md` and the AGENTS.md logging rule. Re-run the R2.22 tests until green.

### 8. Risks / migration notes

Operators lose the SMTP reply text in logs; `code`/`command`/`responseCode` remain. If needed later, a
redacted reply (address pattern replaced) could be added; not now.

---

## Group check (all findings of this track)

- [ ] R2.24 From the repository root: `make check`, `make lint` (read warnings), `make fmt`, `make test-db-provision` (once), then `make test-api`, `make test-shared` and `make test` each with its own exit code checked, and `make docs-check`. No `make db-generate` change is expected (`git status packages/db/drizzle` clean) and no `docs/api-reference.md` diff (`docker compose run --rm --no-deps app pnpm --filter @brewform/api run docs:api` then `git diff --exit-code docs/api-reference.md`).

---

## Cross-track notes

1. **Finding 32 (lint-style raw-SQL registry, other track):** after R2.13 the `lower()` registry row must
   read "`lower()` over a column or a bound value (`packages/db/src/schema.ts`), used by the
   `_lower_unique` indexes and both sides of identifier lookups".
2. **Finding 34 (dead code, other track):** this track already deletes `getPublicUrl`, `saveThumbnail`,
   `THUMBNAIL_SIZES`, `ThumbnailOptions` and `getThumbnailSizes` in `apps/api/src/utils/upload/index.ts`
   (R2.17) and the identifier helpers + setup logs (R2.20-R2.21). The dead-code track should not repeat them,
   and the assembler must keep only one MODIFIED block per requirement (`model-test-coverage` Tier 2 util row,
   `unique-identifiers` ×5, `api-service-logging` ×2).
3. **New (minor):** `notification/service.ts:148,226,299,391` log raw `err` from the `notifyX` helpers,
   which only throw DB lookup errors (Drizzle messages carry bound parameters: user ids, no PII). AGENTS.md
   asks for `toLoggableError(err)` on DB errors; a one-word change per site if any track touches the file.
4. **New (informational, no failing case in supported topologies):** Hono `secureHeaders()` defaults add
   `Cross-Origin-Resource-Policy: same-origin` (Context7 `/websites/hono_dev`, secure-headers defaults) to
   `/uploads/*`. Photo URLs are root-relative (`/uploads/<key>`), so the local driver only works same-origin
   (compose edge, Vite proxy) and the header never bites. If a split-domain topology with
   `STORAGE_DRIVER=local` is ever documented, `/uploads` needs `cross-origin`.
5. **Pre-existing, not new:** `deletePhoto` soft-deletes the row but keeps the file, so a deleted photo's
   URL stays publicly fetchable (and, after finding 3, browser-cacheable). Belongs with D99.41 (photo
   gallery wiring) if anyone revisits photo deletion.
6. **Related ledger:** D99.50 (`/ready` cache status) is the cache-side twin of finding 18; not closed here.
