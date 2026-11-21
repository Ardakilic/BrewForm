# t4a-upload-security — research and validation notes

Track: upload storage keys and file validation hardening.
Capability owned: `photo-upload-security` (new).
Audit sources: `plans/AUDIT-2026-11-18.md` §3.4. Raw findings `security/s3-key-from-client-filename`
(high), `security/photo-upload-unbounded-body` (medium), and `api-architecture/photo-upload-unbounded`
(medium).

User decision (verbatim): "Filenames should be random, you're right. This should be addressed."

---

## 1. Claim validation (read against the code on 2026-11-18)

| # | Audit claim | Verdict | Evidence |
|---|-------------|---------|----------|
| 1 | The object key keeps the client's filename extension, with no allowlist or character filter | **Confirmed** | `apps/api/src/utils/upload/index.ts:53-58` `const ext = originalName.split('.').pop() \|\| 'jpg'`; `modules/photo/service.ts:57` `generateFilename(file.name)`; `modules/photo/index.ts:117` `name: fileField.name` (the raw multipart filename) |
| 2 | The S3 URL is concatenated without encoding, then `new URL()` normalises it and that normalised path is signed | **Confirmed** | `utils/storage/s3.ts:28-29` builds `${endpoint}/${bucket}/${filename}`; `:88` `new URL(url)`; `:113` the canonical URI is `parsedUrl.pathname` and `:114` the canonical query is `parsedUrl.search.slice(1)` |
| 3 | The filename `a.x/%2e%2e/%2e%2e/other-bucket/payload` becomes the path `/other-bucket/payload` | **Confirmed, reproduced locally** (Node v26.13.1, see §2) | `Request.formData()` keeps the name unchanged. The generated filename is `<ts>-<id>.x/%2e%2e/%2e%2e/other-bucket/payload`, and the signed pathname is `/other-bucket/payload` |
| 3a | (new, the audit did not report it) A query string can be injected the same way | **Confirmed, worse than reported** | The filename `a.x/%2e%2e?policy=` gives pathname `/brewform-uploads/` and canonical query `policy=`. The server then signs and sends a **bucket-subresource PUT** (`?policy=`, `?cors=`, `?tagging=`, `?acl=` …), using the photo bytes as the body. Whether the provider accepts it depends on the token's scope and on extra headers some operations need (for example `Content-MD5` on AWS PutBucketCors). R2 "Admin Read & Write" tokens and Garage keys with owner rights can perform bucket configuration writes. |
| 3b | (new) Thumbnail keys can also be exploited | **Confirmed** | `generateThumbnailFilename` (`upload/index.ts:61-68`) takes the extension from the already-poisoned original filename. `<ts>-<id>_medium.x/%2e%2e/%2e%2e/other-bucket/payload` also normalises to `/other-bucket/payload` |
| 3c | (new) A crafted key can overwrite another user's photo in the same bucket | **Confirmed** | `a.x/%2e%2e/victim-key` resolves to `/b/victim-key` |
| 4 | The MIME check trusts the client-declared `file.type` | **Confirmed** | `upload/index.ts:42-50`. The rejection message also echoes the client-controlled `file.type` back (`:44`) |
| 5 | The S3 PUT has no Content-Type | **Confirmed** | `s3.ts:30-31, 94-109`: only `host`, `content-length`, `x-amz-content-sha256` and `x-amz-date` are set and signed |
| 6 | `/api/v1/photos` skips the body limit and has no replacement | **Confirmed** | `middleware/bodyLimit.ts:15, 61-66` (`return next()` for `PHOTOS_ROUTE_RE`) |
| 7 | The whole body is buffered before any size check | **Confirmed** | `photo/index.ts:81` `await c.req.formData()` (undici parses the whole multipart body into memory), then `:106-110` `arrayBuffer()`. `validateImageUpload` only runs later, in `service.ts:54` |
| 8 | Thumbnails are never validated | **Confirmed** | `upload/index.ts:102-114` `saveThumbnail` writes any non-empty bytes; `photo/index.ts:107-110` |
| 9 | Internal error text leaks to clients | **Confirmed** | `photo/index.ts:127-132`: the catch-all is `error(c, 'UPLOAD_ERROR', message, 400)`. Sources: S3 `HTTP ${status}: ${body}` (`s3.ts:62`), `S3 upload failed: …` (`s3.ts:32`), Drizzle query errors, and for the local driver (new finding) `ENOENT: no such file or directory, open '/app/apps/api/uploads/<ts>-<id>.x/sub/evil'`, which exposes the absolute server path (`local.ts:14-15` creates only `UPLOAD_DIR`, not subfolders) |
| 10 | The local driver is protected against traversal | **Confirmed, with a nuance** | `local.ts:28-37` rejects `..`, absolute paths and paths outside `UPLOAD_DIR`. A name with `/` and no `..` still reaches `writeFile`, fails with ENOENT, and that leaks the path (row 9). The `/uploads/*` read handler (`main.ts:84-125`) has the same guards and maps extension → Content-Type, falling back to `application/octet-stream`. `secureHeaders` adds `nosniff` (`main.ts:65`) |
| 11 | Are there avatar uploads? | **None exist** | `avatarUrl` is a plain `z.url()` string (`packages/shared/src/schemas/user.ts:39`). The only upload path is `POST /api/v1/photos` |
| 12 | Does anything call `StorageDriver.delete()`? | **No production caller** | Photo deletes are soft deletes only (`photo/service.ts:80-86`). A key guard on `delete()` therefore cannot break existing flows |
| 13 | Do photo rows store keys or URLs? | **URLs** | `photos.url` and `photos.thumbnailUrl` hold full public URLs (`service.ts:63-69`). The new key format needs no DB migration, and old rows keep resolving |
| 14 | `UPLOAD_ALLOWED_TYPES` parsing | **Latent bug (new)** | `upload/index.ts:4` `split(',')` does not trim, so `image/jpeg, image/png` silently drops PNG. `UPLOAD_MAX_SIZE_BYTES` is `z.coerce.number()` with no int or positive bound (`config/env.ts:73-74`) |
| 15 | Client thumbnails | **Context** | `apps/web/src/components/photos/PhotoUpload.tsx:16-49` always produces a JPEG of at most 600 px at q=0.85 (ADR-009). The thumbnail's own filename (`:87`) is ignored server-side. Today a PNG original gets a JPEG thumbnail stored under a `.png` key (wrong Content-Type). The new design fixes that because the thumbnail extension comes from the thumbnail's own bytes |

Severity stands: **high**. The query-string variant (3a) widens the impact from "write an arbitrary object
anywhere" to "issue arbitrary signed bucket-configuration PUTs", subject to the token's scope.

## 2. Reproduction (scratch scripts, not committed)

Node v26.13.1, `Request.formData()` on a hand-built multipart body:

```
file.name = "a.x/%2e%2e/%2e%2e/other-bucket/payload" type= image/jpeg
generated filename = 1795033516234-ccfac4bc.x/%2e%2e/%2e%2e/other-bucket/payload
signed pathname = /other-bucket/payload
in-bucket overwrite pathname = /b/victim-key
thumbnail name = 1795033516234-ccfac4bc_medium.x/%2e%2e/%2e%2e/other-bucket/payload
thumb pathname = /other-bucket/payload

"a.x/%2e%2e?cors="   -> pathname /brewform-uploads/  search "?cors="    canonicalQuery "cors="
"a.x/%2e%2e?policy=" -> pathname /brewform-uploads/  search "?policy="  canonicalQuery "policy="
"a.x?tagging="       -> pathname /brewform-uploads/123-abcd1234.x search "?tagging="
"a.html"             -> pathname /brewform-uploads/123-abcd1234.html   (stored with no Content-Type)
```

## 3. Research

### 3.1 Magic-byte detection: built-in check vs a library

- **`file-type`** (Context7 `/sindresorhus/file-type`, v21): ESM-only, and it pulls in `strtok3`,
  `token-types`, `@tokenizer/inflate` and `uint8array-extras`. Its README says: *"File type detection is based on
  binary signatures (magic numbers) and is a best-effort hint. It does not guarantee the file is
  actually of that type or that the file is valid/not malformed … When processing untrusted files on a
  server, enforce a reasonable file size limit and use a worker thread with a timeout."* Its
  `maxBufferSize` option defaults to `Infinity` (CWE-789). It also returns no image dimensions, so it would not cover the
  decompression-bomb guard.
- **`image-size`** (zero-dependency, pure JS) returns `{ type, width, height }` for about 20 formats. It is the
  best fallback if the built-in parser ever turns out to be too narrow. It was not chosen because the
  allowlist has only 3 formats and the user prefers built-in methods.
- **`sharp`**: does a full decode and could re-encode and strip metadata, but it is a native dependency, and it is
  the subject of F23 (image optimisation), not this security fix.
- **Built-in prototype** (scratch `sniff.mjs`, about 50 lines) checks signatures and parses header dimensions:
  - JPEG `FF D8 FF`, then walks the marker segments to SOF0–SOF15 (excluding C4/C8/CC); height and width are big-endian 16-bit at +5 and +7.
  - PNG `89 50 4E 47 0D 0A 1A 0A`, with `IHDR` required at offset 12; width and height are big-endian 32-bit at 16 and 20.
  - WebP `RIFF…WEBP`, with `VP8 ` (start code `9D 01 2A`, 14-bit little-endian dims), `VP8L` (signature `0x2F`, 14+14 bits plus 1) or
    `VP8X` (24-bit little-endian canvas dims plus 1).
  - Verified against a real 9.3 MB JPEG (6016×6016, which matches `sips`), a PNG (900×900) and 1×1 lossy and
    lossless WebP. HTML and SVG return `null`. A crafted PNG IHDR of 65535×65535 parses, so the dimension guard
    can reject it.
  - **Decision: built-in.**

### 3.2 Body limit: Hono `bodyLimit` semantics

From Context7 `/websites/hono_dev` and the installed source at `node_modules/hono/dist/middleware/body-limit/index.js`:
- If `Content-Length` is present and `Transfer-Encoding` is absent, the middleware compares the header value with
  `maxSize` and calls `onError` without reading the body. On Node, llhttp guarantees the body stream ends at
  the declared length, so trusting the header is safe.
- Otherwise it reads the stream chunk by chunk, calls `onError` as soon as `size > maxSize`, and rebuilds the request from
  the buffered chunks. Memory is therefore bounded by `maxSize`.
- It can be applied per route or selected per path inside the existing `bodyLimitMiddleware`, and it adds no dependencies.
- **Decision:** replace the `return next()` bypass with a second `bodyLimit` instance sized for photos.
  A streaming multipart parser (`busboy` / `@fastify/busboy`) was rejected: it adds a dependency and rewrites the
  handler, and once the cap is in place the buffered size is already bounded (about 11 MiB).

### 3.3 S3 SigV4 path encoding

From AWS SigV4 docs and the SDK signer notes (web search): S3 expects each path segment to be URI-encoded
**once** (no double encoding, unlike other services). `UriEncode` percent-encodes every byte except
`A–Z a–z 0–9 - . _ ~`. Open-source signers (rust-s3, rustack-auth) decode and then re-encode the path to avoid
double encoding. **Implication:** the driver must compute the canonical URI from its own encoded
path, not from `new URL().pathname`, which normalises dot segments. As a final check it should assert that the
parsed URL's pathname and search equal what was signed.

### 3.4 OWASP File Upload Cheat Sheet (web search)

- Generate the stored filename on the server. That way the attacker no longer controls which file is targeted.
- Treat the Content-Type and filename as client-controlled. Validate content with magic bytes and an allowlist.
- Magic bytes alone do not stop polyglots. Also store files off the web root, never execute them, and serve them with an
  explicit Content-Type. BrewForm does all of this: there is no SVG in the allowlist, the stored type is an explicit `image/*`, the local handler sends
  `nosniff`, and in production the public bucket is a separate origin. Browsers do not sniff `image/*` responses as HTML.

Sources:
- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [AWS SigV4 header-based auth (S3)](https://docs.amazonaws.cn/en_us/AmazonS3/latest/API/sig-v4-header-based-auth.md)
- [AWS Java SDK AWSS3V4Signer, "don't double-url-encode path elements"](https://docs.aws.amazon.com/AWSJavaSDK/latest/javadoc/com/amazonaws/services/s3/internal/AWSS3V4Signer.html)
- [rust-s3 signing.rs (decode then re-encode the path)](https://docs.rs/crate/rust-s3/0.37.2/source/src/signing.rs)
- [Hono Body Limit middleware](https://hono.dev/docs/middleware/builtin/body-limit)
- [file-type README](https://github.com/sindresorhus/file-type/blob/main/readme.md)

## 4. Cross-track coordination notes (for the orchestrator)

1. **`openspec/specs/request-body-limit/spec.md` should be MODIFIED by whichever track owns it, or by the
   orchestrator.** This track writes only `photo-upload-security`. The new bounded photo cap is specified there
   as an ADDED requirement, and it does not contradict the literal text of `Photo upload route exclusion`: photos
   are still excluded from the **1 MB** limit. Two things are still worth fixing:
   - `Requirement: Photo upload route exclusion` should state that photo routes are subject to the photo
     body cap. A proposed replacement is below.
   - `Requirement: Test coverage` still says `deno test --no-check --allow-all …`. That is Deno drift and should become
     `make test-specific filter=src/middleware/bodyLimit.test.ts` (Vitest).

   Proposed MODIFIED block (header text matches the current spec exactly):

   ```markdown
   ### Requirement: Photo upload route exclusion

   The `POST /api/v1/photos` route and all photo sub-routes SHALL be excluded from the 1 MB global body limit and SHALL instead be subject to the photo upload body cap defined by the `photo-upload-security` capability (`UPLOAD_MAX_SIZE_BYTES` + thumbnail cap + 64 KiB multipart overhead), so that file uploads up to the application-level limit enforced by `validateImageUpload()` (`UPLOAD_MAX_SIZE_BYTES`, default 10 MB) are accepted while larger bodies are rejected with 413 before being buffered.

   #### Scenario: Photo upload under 10 MB is accepted

   - **WHEN** a client sends a multipart/form-data POST request to `/api/v1/photos` with a file under `UPLOAD_MAX_SIZE_BYTES`
   - **THEN** the request reaches the photo upload handler
   - **AND** the handler proceeds to `validateImageUpload()` for application-level validation

   #### Scenario: Photo upload exceeding the application limit is rejected by validateImageUpload

   - **WHEN** a client sends a multipart/form-data POST request to `/api/v1/photos` whose body is within the photo body cap but whose file part exceeds `UPLOAD_MAX_SIZE_BYTES`
   - **THEN** the request reaches the photo upload handler
   - **AND** `validateImageUpload()` returns an error
   - **AND** the handler returns HTTP 400 with code `FILE_TOO_LARGE` (not 413)

   #### Scenario: Photo request body above the photo cap is rejected before buffering

   - **WHEN** a client sends a request to any `/api/v1/photos` route whose `Content-Length` (or streamed size) exceeds the photo body cap
   - **THEN** the system returns HTTP 413 `PAYLOAD_TOO_LARGE`
   - **AND** the route handler is never invoked
   ```

   The Middleware stack order diagram in that spec reads `bodyLimit(1MB, excl. /api/v1/photos)`. It could
   become `bodyLimit(1MB; photo routes: photo cap)`.
2. **`apps/api/src/config/env.ts`** is also edited by the production-compose/env track (`''` → `undefined`
   preprocessing for `S3_*`, `UPLOAD_DIR` default). This track touches only the `UPLOAD_MAX_SIZE_BYTES` and
   `UPLOAD_ALLOWED_TYPES` lines. Whichever lands second must rebase.
3. **`apps/api/src/modules/photo/{index,service,model}.ts`** are also touched by the visibility and
   soft-deleted-photo tracks (photo list visibility, soft-delete filtering), and **`PhotoUpload.tsx`** by the
   photo-wiring track. The upload hardening touches only the `POST /` handler, `uploadPhoto` and the upload
   and storage utils, and the web change is limited to error-code → i18n mapping.
4. **Docs:** `AGENTS.md` (middleware line), `docs/api.md` (Photos), `docs/decisions.md` (new ADR) and
   `docs/deployment_coolify.md` §10 (scope the R2 token to the bucket) may also be edited by the docs track.
   The tasks fragment lists the exact edits this track needs.

## 5. Out of scope / follow-ups (recorded, not specified)

- **EXIF/GPS metadata stripping.** Phone photos often carry GPS coordinates (PII), and the server stores the original
  bytes publicly. Stripping metadata safely needs orientation handling, which is best done with re-encoding (`sharp`, F23).
  Recommended as a follow-up.
- **Per-user upload rate limit.** Even with the cap, concurrent uploads can each hold about 11 MiB. The rate-limit track
  owns limiter changes.
- `Cache-Control: public, max-age=31536000, immutable` on the S3 PUT. The keys are random and immutable, so this is safe,
  but it is a performance item, not a security one.
- Configurable dimension limits (env vars) if operators need panoramas wider than 16,384 px.
