### Upload storage key & file validation hardening (t4a-upload-security)

**Context**

Current state, validated against the code on 2026-11-18. Full evidence and reproduction are in
`audit/t4a-upload-security.md`.

- **Key derivation.** `apps/api/src/utils/upload/index.ts:53-58` builds the key as
  `${Date.now()}-${uuid.slice(0,8)}.${originalName.split('.').pop()}`. The extension is the raw tail of the
  multipart filename (`modules/photo/index.ts:117` → `service.ts:57`). Thumbnails copy that tail
  (`upload/index.ts:61-68`).
- **S3 request.** `utils/storage/s3.ts:28-29` concatenates `${endpoint}/${bucket}/${filename}` unencoded,
  then signs `new URL(url).pathname` and `.search` (`:88, :113-114`). On Node v26.13.1 the filename
  `a.x/%2e%2e/%2e%2e/other-bucket/payload` was signed and sent as `/other-bucket/payload`, as the audit
  claimed. Validation found the claim understated: `a.x/%2e%2e?policy=` produces a signed
  **bucket-subresource PUT** (`/brewform-uploads/?policy=`), so `?cors=`, `?acl=` and `?tagging=` are reachable
  as well, subject to the token's scope. The same name also poisons the thumbnail key. No `Content-Type` is
  sent or signed (`s3.ts:94-109`).
- **Type check.** The type check reads only the client-declared `file.type` (`upload/index.ts:42-50`), and the
  rejection message echoes that type back.
- **Body size.** `/api/v1/photos` is excluded from the 1 MB `bodyLimit` with no replacement
  (`middleware/bodyLimit.ts:15, 61-66`). `c.req.formData()` (`photo/index.ts:81`) buffers the whole body
  before any size check, and thumbnails are never validated (`upload/index.ts:102-114`).
- **Error mapping.** The catch-all maps every error to `400 UPLOAD_ERROR` with `err.message`
  (`photo/index.ts:127-132`). That leaks S3 response bodies, Drizzle SQL and, with the local driver, absolute
  `ENOENT` paths. A crafted `x/sub/evil` key reaches `writeFile` because `local.ts:28-37` blocks only `..`.
- **Scope checks.** The local driver and the `/uploads/*` read handler (`main.ts:84-125`) are traversal-safe.
  There is no avatar upload: `avatarUrl` is a URL string. `StorageDriver.delete()` has no production caller.
  Photo rows store full URLs (`photos.url`, `photos.thumbnailUrl`), not keys.
- **Config.** `UPLOAD_ALLOWED_TYPES` is split without trimming, and `UPLOAD_MAX_SIZE_BYTES` has no integer or
  positive bound (`config/env.ts:73-74`, `upload/index.ts:4`).
- **Validation outcome.** All three audit findings are confirmed, and severity stays **high**. Four related
  defects were found during validation: the query-string injection, thumbnail key poisoning, local-driver path
  disclosure, and reflection of the declared type in error messages.

**Decisions**

1. **Fully server-generated keys: `<uuidv4>.<ext>` and `<uuidv4>_medium.<ext>`.**
   - *Choice:* `crypto.randomUUID()` (122 random bits) plus an extension from the fixed table
     `{image/jpeg: jpg, image/png: png, image/webp: webp}`. A new `generateStorageKey(mime)` returns
     `{ id, key }`, and `thumbnailKey(id, mime)` derives the thumbnail key. The client filename is not a
     parameter, so it cannot reach the key. `generateFilename` and `generateThumbnailFilename` are removed.
   - *Alternatives:* (a) sanitise the client extension. Rejected: it still trusts client input, and the user
     asked for random names. (b) `randomBytes(16).toString('base64url')`. Workable, but mixed-case keys are less
     readable in bucket UIs, and the UUID matches existing id conventions. (c) A content hash (SHA-256) as the
     key. Rejected: equal uploads would share an object, so a delete or overwrite affects other users, and the
     key reveals content equality. (d) Keep the timestamp prefix. Rejected: it leaks upload time and the DB
     already has `createdAt`. (e) A `photos/` folder prefix. Deferred: it would need `/` in keys, which the
     driver guard forbids; a fixed driver-level prefix could be added later.
   - *Rationale:* removes the whole class of client-controlled-path bugs, which is what the user asked for.

2. **Built-in magic-byte detector with header-dimension parsing, in a new `apps/api/src/utils/upload/sniff.ts`.**
   - *Choice:* pure functions with no I/O, about 80 lines. `detectImage(bytes) →
     { mime, ext, width, height } | null` checks the JPEG/PNG/WebP signatures and parses dimensions: the JPEG
     marker walk to SOF0–15 excluding C4/C8/CC, PNG IHDR, and WebP VP8/VP8L/VP8X. A scratch prototype matched
     `sips` on a real 9.3 MB 6016×6016 JPEG and on PNG and WebP (lossy and lossless), and returned null for
     HTML and SVG.
   - *Alternatives:* (a) `file-type` v21. It is ESM-only with 4 transitive dependencies, its own README calls
     detection "a best-effort hint" and advises a worker thread for untrusted input, and it returns no
     dimensions. (b) `image-size`. Zero dependencies and covers both needs; kept as the documented fallback if
     the built-in parser proves too narrow. (c) `sharp`. Full decode and re-encode; a native dependency that
     belongs to F23.
   - *Rationale:* the allowlist has only 3 formats, the user prefers built-in methods, and dimension parsing
     comes for free.

3. **The declared Content-Type is advisory.**
   - *Choice:* reject when the declared type is non-empty, not `application/octet-stream` and not allowed
     (preserving today's 415-class behaviour for obviously wrong parts). Otherwise the detected type is
     authoritative for the key extension and the stored Content-Type. When a declared-but-allowed type differs
     from the detected one, log it at `debug` and continue.
   - *Alternatives:* reject on any declared/detected mismatch. Rejected: browsers derive `file.type` from the
     extension, so a renamed `.png` that is really a JPEG would fail. That adds no security, because nothing
     client-declared is persisted.
   - *Rationale:* safety comes from the bytes, not from labels.

4. **Dimension limits as code constants, not env vars.**
   - *Choice:* originals are capped at 16,384 px per side and 50 MP total; thumbnails at 1,200 px per side
     (the largest `THUMBNAIL_SIZES` preset, and the client produces at most 600 px). The constants are exported
     from a new `utils/upload/limits.ts`, which imports only `config`. That lets `bodyLimit.ts` import the cap
     without constructing the storage driver, which `utils/upload/index.ts` does at load.
   - *Alternatives:* env-configurable limits. Rejected for now: they add env sprawl and docs churn, and the
     limits can be promoted later.
   - *Rationale:* 50 MP accepts every 48–50 MP phone photo (for example 8064×6048) and 36 MP desktop images,
     and rejects PNG decompression-bomb headers such as 65535×65535. The server never decodes pixels today, so
     the guard protects browsers and the future F23 decoder.

5. **Bounded photo body: a second `hono/body-limit` instance inside `bodyLimitMiddleware`.**
   - *Choice:* `PHOTO_BODY_MAX = UPLOAD_MAX_SIZE_BYTES + THUMBNAIL_MAX_SIZE_BYTES + 64 KiB`, where
     `THUMBNAIL_MAX_SIZE_BYTES = min(1 MiB, UPLOAD_MAX_SIZE_BYTES)`. With the defaults this is about 11.06 MiB.
     `PHOTOS_ROUTE_RE` now selects `photoBodyLimit` instead of `next()`. The `onError` handler logs `warn` and
     returns the standard `413 PAYLOAD_TOO_LARGE` envelope. The middleware stays in its current stack slot, so
     the AGENTS.md order is unchanged.
   - *Alternatives:* (a) a streaming multipart parser (`busboy` / `@fastify/busboy`) that aborts per part.
     Rejected: it adds a dependency and rewrites the handler, and memory is already bounded by the cap. (b) Apply
     the limit only on the route. Rejected: the global middleware already owns body limits, and one place is
     easier to audit. (c) Rely on the Cloudflare or Caddy cap. Rejected: that cap is 100 MB and does not exist in
     `compose.production.yml`.
   - *Rationale:* Hono checks `Content-Length` without reading (llhttp enforces the exact length on Node) and
     otherwise aborts the stream once `size > maxSize`.

6. **Status and error codes.**
   - *Choice:* the transport cap returns 413 `PAYLOAD_TOO_LARGE`. A part over its size limit returns 400
     `FILE_TOO_LARGE`. An unknown or disallowed type returns 415 `UNSUPPORTED_MEDIA_TYPE`. Malformed images,
     zero dimensions or dimensions over the limits return 400 `INVALID_IMAGE`. A missing file or bad form fields
     return 400 `VALIDATION_ERROR` as today. Part-level errors carry `details: [{ field: 'file' | 'thumbnail',
     message }]`.
   - *Alternatives:* 413 for a part over its limit. Rejected to stay consistent with the existing
     `request-body-limit` scenario ("400, not 413").
   - *Rationale:* the codes are stable and the web client can map them to the existing i18n keys.

7. **Typed `UploadValidationError` replaces string matching.**
   - *Choice:* a class in `utils/upload/errors.ts` with `{ code, status, field, message }` and fixed, safe
     messages. The controller maps `UploadValidationError`, `RECIPE_NOT_FOUND` and `FORBIDDEN`, and rethrows
     anything else to `app.onError`. That handler already hides messages and returns 500 `INTERNAL_ERROR` in
     production, and it logs `err` with `requestId`.
   - *Alternatives:* sanitise messages in the catch-all. Rejected: denylisting is fragile.

8. **Defence in depth in the drivers.**
   - *Choice:* add `assertSafeStorageKey(key)` in `utils/storage/key.ts`, enforcing
     `^[A-Za-z0-9][A-Za-z0-9_-]{0,127}(\.[A-Za-z0-9]{1,8})?$`. A single optional dot means `..`, `/`, `%`, `?`
     and `#` are impossible. Both drivers call it on `save` and `delete` before any I/O.
   - In `S3StorageDriver`:
     - Build the path with a SigV4 `uriEncode` (RFC 3986 unreserved set, encoded once) applied to the bucket and
       each key segment.
     - Sign that exact string as the canonical URI with an empty query.
     - After `new URL()`, assert `pathname === signedPath && search === ''`, otherwise throw.
     - Add `content-type` to the headers and to `SignedHeaders`.
   - `StorageDriver.save(data, key, { contentType })` becomes the interface. The local driver ignores
     `contentType`; the read handler already maps the extension.
   - *Alternatives:* rely on the key generator alone. Rejected: one regression would reopen a high-severity
     hole.

9. **Strict thumbnail policy.**
   - *Choice:* an invalid thumbnail fails the whole upload, and nothing is stored.
   - *Alternatives:* drop the bad thumbnail and fall back to the original URL. Rejected: it silently accepts
     hostile input, and the legitimate web client always sends a valid JPEG.

10. **Validate everything first, then write, with best-effort cleanup.**
    - *Choice:* run ownership and validation for both parts, then write the original, then the thumbnail, then
      the DB row. On any failure after the first write, call `driver.delete()` on the keys already written
      (`warn` on cleanup failure) and rethrow.
    - *Rationale:* avoids orphaned public objects from validation failures, and tries to clean up after
      infrastructure failures.

11. **Config validation in `config/env.ts`.**
    - *Choice:* `UPLOAD_MAX_SIZE_BYTES: z.coerce.number().int().positive()`. `UPLOAD_ALLOWED_TYPES` is
      transformed to trimmed, lower-cased, non-empty entries and refined to be a subset of
      `SUPPORTED_IMAGE_MIME_TYPES`, failing with a message that names the variable and the bad entry. The upload
      util consumes the parsed array instead of calling `split(',')`.
    - *Alternatives:* ignore unsupported entries with a warning. Rejected: an operator who sets `image/gif`
      would believe GIFs work.

12. **No EXIF stripping in this change.**
    - *Choice:* record GPS/EXIF privacy as a follow-up for F23 (sharp re-encode).
    - *Rationale:* stripping metadata without re-encoding loses EXIF orientation, and browsers would then show
      phone photos rotated.

**Risks / Trade-offs**

- [Risk] The built-in JPEG parser rejects a legitimate but unusual JPEG (large APPn segments before SOF,
  arithmetic-coded SOF9–SOF15, fill bytes) → Mitigation: walk segments by their length fields, accept all SOF
  markers except C4/C8/CC, add fixtures for progressive and EXIF-heavy JPEGs, and log the reason at `warn` so
  false positives are visible. `image-size` is the documented fallback.
- [Risk] Memory is still held per request up to the cap (about 11 MiB) × concurrency → Mitigation: the cap is
  bounded, and a per-user upload rate limit is flagged as a follow-up for the rate-limit track.
- [Risk] The code change from `UPLOAD_ERROR` to specific codes, and from 400 to 415 for wrong types, breaks
  external clients → Mitigation: the only client is the in-repo web app, which shows a generic message. The
  web task maps the new codes to the existing i18n keys. Document the codes in `docs/api.md`.
- [Risk] The stricter `UPLOAD_ALLOWED_TYPES` validation stops boot for operators with custom values → Mitigation:
  a clear error message, a release note in the PR, and the default value is unaffected.
- [Risk] Adding `content-type` to `SignedHeaders` is rejected by an S3-compatible backend → Mitigation: SigV4
  allows any header in `SignedHeaders` (R2, Garage and MinIO support it). Verify manually against the dev
  Garage service (`make up`) before merge.
- [Risk] A bucket was already abused through the old bug → Mitigation: operator guidance in the PR and in
  `docs/deployment_coolify.md`: audit for keys not matching the legacy `^\d{13}-[0-9a-f]{8}(_medium)?\..+$`
  or the new UUID pattern, review bucket CORS, policy and ACL, and scope the R2 token to the uploads bucket
  ("Object Read & Write", specific bucket).
- [Risk] Merge conflicts with other wave-6 tracks that touch `config/env.ts`, the photo module, `PhotoUpload.tsx`,
  `AGENTS.md` and the docs → Mitigation: this track only touches the POST handler, `uploadPhoto`, the
  upload/storage utils, the bodyLimit photo branch and the two `UPLOAD_*` env lines. Land after the env-preprocessing
  change or rebase onto it.
- [Trade-off] The 1,200 px thumbnail limit rejects a third-party client that uploads a larger "thumbnail" →
  acceptable, because the documented contract is a 600 px client thumbnail (ADR-009).

**Migration / Rollout**

- **DB:** none. Photo rows store full URLs, and new keys only change the URL tail for new uploads. No change to
  `packages/db/src/schema.ts`, so no `make db-generate` is needed. Assert that `make db-generate` still prints
  "No schema changes".
- **Existing objects:** legacy keys (`<13-digit-ts>-<8hex>.<ext>`) keep resolving. The local `/uploads/*` read
  handler is unchanged, and S3 public URLs are served by the bucket. The key guard applies only to new writes
  and deletes, and there are no production deletes.
- **Env vars:** no new variables. `UPLOAD_MAX_SIZE_BYTES` must now be a positive integer, and
  `UPLOAD_ALLOWED_TYPES` must be a subset of `image/jpeg,image/png,image/webp` (whitespace is tolerated).
  Neither `.env.example` lists them today. Add commented default lines with these constraints to the root
  `.env.example`.
- **Docs:**
  - `docs/api.md` Photos: constraints, error codes, dimension limits and key format.
  - `docs/decisions.md`: a new ADR (next free number) for server-generated keys and the built-in sniffing.
  - `docs/deployment_coolify.md` §10: scope the token to the bucket, plus a post-upgrade audit note.
  - `AGENTS.md` middleware line: bodyLimit is 1 MB, with the photo cap on photo routes.
  - The `request-body-limit` spec delta is proposed in the audit notes for the orchestrator.
- **Rollback:** revert the commit. Objects written under the new UUID keys stay valid because their URLs are
  stored, and the old code reads URLs, not keys. No data repair is needed.
- **Operator follow-up after deploy, for S3 deployments that ran the old code:**
  - Audit the bucket and other buckets reachable by the token for unexpected keys.
  - Check bucket CORS, policy, ACL and tagging for unexpected changes.
  - Rotate the S3 token if anything is found.
