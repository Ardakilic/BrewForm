### Upload hardening — shared test fixtures and failing regression tests

- [ ] Add `apps/api/src/test-fixtures/images.ts` exporting minimal valid byte arrays: `JPEG_1x1` (SOI + APP0 + SOF0 + SOS + EOI), `PNG_1x1` (signature + IHDR + IDAT + IEND), `WEBP_LOSSY_1x1`, `WEBP_LOSSLESS_1x1`, `WEBP_VP8X_1x1`. Also add `makeJpeg(width, height)` / `makePng(width, height)` header builders, plus hostile samples: `HTML_BYTES`, `SVG_BYTES`, `GIF89A_1x1`, `PNG_BOMB_HEADER` (IHDR 65535×65535) and `JPEG_NO_SOF` (SOI + APP0 + SOS). Use explicit `.ts` imports and add a one-line JSDoc per export
- [ ] Add a failing test to `apps/api/src/modules/photo/service.test.ts`. As the recipe author, upload `JPEG_1x1` with `name: 'a.x/%2e%2e/%2e%2e/other-bucket/payload'` and assert that `photo.url` matches `/uploads/<uuidv4>.jpg`, does not contain `other-bucket`, `%2e` or `..`, and that `thumbnailUrl === url`. Add a second case for `name: 'a.x/%2e%2e?policy='`. Confirm both fail on the current `generateFilename`
- [ ] Add failing tests to `apps/api/src/modules/photo/service.test.ts`:
  - `HTML_BYTES` declared `image/jpeg` is rejected with `UploadValidationError` `code: 'UNSUPPORTED_MEDIA_TYPE'`, `field: 'file'`, and no photo row exists afterwards
  - an HTML thumbnail with a valid original is rejected with `field: 'thumbnail'`, and no row and no file exist in the test `UPLOAD_DIR`
  - `PNG_BOMB_HEADER` gives `INVALID_IMAGE`
  - PNG bytes declared `image/jpeg` are stored under a `.png` key
- [ ] Replace the `[1, 2, 3]` placeholder bytes in the `makeFile()` helper of `apps/api/src/modules/photo/service.test.ts` with fixture bytes matching the declared type. Update the "unsupported file types" expectation from the old `Unsupported file type: ${type}` string to the typed error code

### Upload hardening — image detection util

- [ ] Create `apps/api/src/utils/upload/mime.ts` with no imports. It exports `SUPPORTED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const`, the `SupportedImageMime` type, and the frozen `MIME_TO_EXT` table (`jpg`, `png`, `webp`)
- [ ] Write `apps/api/src/utils/upload/sniff.test.ts` first. Assert `detectImage()` returns the correct `{ mime, ext, width, height }` for every fixture in `test-fixtures/images.ts`, and for `makeJpeg(6016, 6016)` and a JPEG with a 60 KB APP1 segment before SOF0, plus a progressive SOF2 case. Assert it returns `null` for HTML, SVG, GIF, `JPEG_NO_SOF`, truncated PNG/WebP headers, an empty array and a 3-byte array
- [ ] Implement `apps/api/src/utils/upload/sniff.ts`: a pure `detectImage(bytes: Uint8Array): DetectedImage | null` covering:
  - JPEG `FF D8 FF`: a marker walk using segment lengths, skipping `FF` fill bytes and standalone markers (`D0`–`D7`, `01`), and accepting SOF0–SOF15 except `C4`/`C8`/`CC`. Return null on SOS/EOI before SOF or on an out-of-bounds read
  - PNG: signature plus `IHDR` at offset 12, with big-endian u32 width/height at 16/20
  - WebP: `RIFF`/`WEBP` with `VP8 ` (start code `9D 01 2A`, 14-bit little-endian dims), `VP8L` (`0x2F` signature, 14+14 bits plus 1) or `VP8X` (24-bit little-endian plus 1)

  It has no dependencies and every read is bounds-checked
- [ ] Add `apps/api/src/utils/upload/errors.ts` with `class UploadValidationError extends Error { code; status; field }` and fixed safe messages per code (`FILE_TOO_LARGE` → 400, `INVALID_IMAGE` → 400, `UNSUPPORTED_MEDIA_TYPE` → 415). Add a co-located `errors.test.ts`

### Upload hardening — key generation and validation in the upload util

- [ ] Update `apps/api/src/utils/upload/index.test.ts`:
  - delete the tests that assert the client extension is preserved (`should preserve the original extension`, `noextension`, and the `generateThumbnailFilename` cases)
  - add tests that `generateStorageKey('image/jpeg')` returns `{ id, key }` with `key === \`${id}.jpg\`` matching the UUIDv4 pattern, that 1,000 calls give unique keys, and that `thumbnailKey(id, 'image/png') === \`${id}_medium.png\``
  - add tests that `validateImagePart()` throws the right `UploadValidationError` for: size over the cap, size over the thumbnail cap, disallowed declared type, unknown bytes, zero or oversized dimensions, and a thumbnail wider than 1,200 px
- [ ] In `apps/api/src/utils/upload/index.ts`, remove `generateFilename` and `generateThumbnailFilename`. Add `generateStorageKey(mime)` (uses `crypto.randomUUID()` and `MIME_TO_EXT`, no client input) and `thumbnailKey(id, mime)`. Put the limits in a new `apps/api/src/utils/upload/limits.ts`, which imports only `config` so that `bodyLimit.ts` can use it without constructing the storage driver. It exports `MAX_IMAGE_SIDE_PX = 16_384`, `MAX_IMAGE_PIXELS = 50_000_000`, `THUMBNAIL_MAX_SIDE_PX = 1_200`, `THUMBNAIL_MAX_SIZE_BYTES = Math.min(1024 * 1024, config.UPLOAD_MAX_SIZE_BYTES)` and `PHOTO_BODY_MAX_BYTES = config.UPLOAD_MAX_SIZE_BYTES + THUMBNAIL_MAX_SIZE_BYTES + 64 * 1024`
- [ ] Replace `validateImageUpload` with `validateImagePart(part: { declaredType: string; size: number; data: Uint8Array }, kind: 'file' | 'thumbnail'): DetectedImage`. It applies, in order:
  1. the size cap for the part
  2. the declared-type advisory check (non-empty, not `application/octet-stream`, not in the allowlist → 415)
  3. `detectImage()`
  4. the allowlist check (detected type ∩ `config.UPLOAD_ALLOWED_TYPES`)
  5. the dimension limits

  It throws `UploadValidationError` and never echoes client strings. Update the `bodyLimit.test.ts` case that imports `validateImageUpload`
- [ ] Change `saveUploadedFile(data, key, contentType)` / `saveThumbnail(...)` in `apps/api/src/utils/upload/index.ts` to pass `{ contentType }` to the driver. Add `deleteStoredFile(key)` for cleanup. Expose a mutable `storageDeps = { driver }`, following the module `deps` pattern, so tests can inject a failing driver, and give it a one-line JSDoc

### Upload hardening — storage driver key guard, S3 integrity and Content-Type

- [ ] Write `apps/api/src/utils/storage/key.test.ts` first. `assertSafeStorageKey` must accept `<uuid>.jpg`, `<uuid>_medium.webp` and the legacy `1731000000000-abcd1234.jpeg`. It must throw for `''`, `.hidden`, `a/b.jpg`, `a\\b.jpg`, `..`, `a..b`, `x.x/%2e%2e/%2e%2e/other-bucket/payload`, `abc.png?policy=`, `a#b`, `a b.jpg` and a 200-character key
- [ ] Implement `apps/api/src/utils/storage/key.ts` exporting `SAFE_STORAGE_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}(\.[A-Za-z0-9]{1,8})?$/` and `assertSafeStorageKey(key)`, which throws `Error('Invalid storage key')` without echoing the key
- [ ] Change `apps/api/src/utils/storage/types.ts` to `save(data: Uint8Array, key: string, options: { contentType: string }): Promise<string>`. Update the JSDoc so the caller supplies the content type and drivers never infer it
- [ ] In `apps/api/src/utils/storage/local.ts`, call `assertSafeStorageKey` at the top of `save` and `delete`, before `mkdir` or any other fs call, and keep the existing `_resolvePath` guards. In `apps/api/src/utils/storage/storage.test.ts`:
  - switch the existing fixture names (`test-file.txt` and others) to safe keys and pass `{ contentType }`
  - assert that `save(bytes, 'abc.x/sub/evil', …)` throws and that no subdirectory is created
- [ ] Write `apps/api/src/utils/storage/s3.test.ts` with `vi.spyOn(globalThis, 'fetch')` and mutated S3 config, following the `storage.test.ts` pattern with a preceded `// biome-ignore` rationale:
  - `save` with a generated key sends one PUT whose URL pathname is `/test-bucket/<key>` with an empty search
  - the request has header `content-type: image/png`
  - the `authorization` `SignedHeaders` contains `content-type`
  - unsafe keys (`1-a.x/%2e%2e/%2e%2e/other-bucket/payload`, `abc.png?policy=`) throw, and `fetch` is never called, for both `save` and `delete`
  - when fetch returns 403 with an XML body, `save` throws, and only the server log receives the body text
- [ ] Refactor `apps/api/src/utils/storage/s3.ts`:
  - add a private `uriEncode(segment)` implementing the SigV4 unreserved set (`A-Z a-z 0-9 - . _ ~`, encoded once)
  - build `path = '/' + uriEncode(bucket) + '/' + key.split('/').map(uriEncode).join('/')` after `assertSafeStorageKey`
  - pass `path` explicitly to `signRequest` as the canonical URI with an empty canonical query
  - after `new URL(endpoint + path)`, throw if `pathname !== path || search !== ''`
  - add `content-type` to the headers and to `SignedHeaders`/`canonicalHeaders` for PUT, keeping header names sorted
  - add module logger `createLogger('s3-storage')` with `debug` entry/exit on `save`/`delete` (key only), `warn` on each retry, and `error` with `err` on final failure

### Upload hardening — bounded photo request body

- [ ] Update `apps/api/src/middleware/bodyLimit.test.ts` first:
  - replace the "does not apply bodyLimit to POST /api/v1/photos" expectations: `content-length` of `PHOTO_BODY_MAX_BYTES + 1` gives 413 `PAYLOAD_TOO_LARGE` with `requestId`, and the handler is not invoked (use a spy flag)
  - a chunked `ReadableStream` body above the cap gives 413
  - a 2 MB `content-length` on `/api/v1/photos` still reaches the handler
  - the same rules hold for `/api/v1/photos/sub`; `/api/v1/photoshop` keeps the 1 MB limit
  - update the real-app integration case
- [ ] In `apps/api/src/middleware/bodyLimit.ts`, add `photoBodyLimit = bodyLimit({ maxSize: PHOTO_BODY_MAX_BYTES, onError })`. The `onError` logs `warn` with `{ event: 'payload_too_large', status: 413, limit: PHOTO_BODY_MAX_BYTES, requestId, path, method, contentLength }` and returns `error(c, 'PAYLOAD_TOO_LARGE', 'Request body too large', 413)`. Route `PHOTOS_ROUTE_RE` matches to `photoBodyLimit` instead of `next()`, and update the file and function JSDoc. Import `PHOTO_BODY_MAX_BYTES` from `utils/upload/limits.ts`, not from `utils/upload/index.ts`, which constructs the storage driver at load

### Upload hardening — photo service and controller

- [ ] Refactor `uploadPhoto` in `apps/api/src/modules/photo/service.ts` to:
  1. add `log.debug({ userId, recipeId }, 'uploadPhoto started')`
  2. keep the ownership checks
  3. run `validateImagePart` on the file and, if non-empty, the thumbnail before any write; log `warn` on rejection with `{ userId, recipeId, reason: err.code, field, declaredType, detectedType, size }` and never the filename, then rethrow
  4. call `generateStorageKey(detected.mime)`
  5. save the original, then the thumbnail (`thumbnailKey(id, thumb.mime)`), then `model.create`
  6. on any failure after the first write, best-effort `deleteStoredFile` for the written keys, `warn` on cleanup failure (`{ err, key }`), and rethrow
  7. log `info({ photoId, key, mime, size, hasThumbnail }, 'Photo saved')` and `debug` 'uploadPhoto completed'

  Change the signature so `file` is `{ declaredType, size, data }` with no `name` field
- [ ] Add a test to `apps/api/src/modules/photo/service.test.ts` that injects a fake driver through `storageDeps`. It throws on the second `save`; assert that `delete` was called with the first key and that no photo row exists. A second test makes `delete` throw as well and asserts that the original error still propagates
- [ ] Update the `POST /` handler in `apps/api/src/modules/photo/index.ts`:
  - stop passing `fileField.name`; pass `declaredType: fileField.type`, `size` and `data` for the file, and the same shape for a non-empty thumbnail
  - map `UploadValidationError` to `error(c, err.code, err.message, err.status, [{ field: err.field, message: err.message }])`
  - keep the `RECIPE_NOT_FOUND` → 404 and `FORBIDDEN` → 403 mappings
  - `throw err` for everything else, which removes the `UPLOAD_ERROR` catch-all
- [ ] Extend `apps/api/src/modules/photo/index.test.ts`. Mount the router with `app.onError(errorHandler)`, authenticate with a real Bearer token from `signAccessToken` (`apps/api/src/modules/auth/jwt.ts`, as used in `auth/index.test.ts`) for a user and recipe seeded through `@brewform/db`, and clean them up in `afterEach`. Assert:
  - a crafted-filename upload gives 201 with a UUID URL
  - HTML bytes give 415 `UNSUPPORTED_MEDIA_TYPE`
  - an oversized thumbnail gives 400 `FILE_TOO_LARGE` with `details[0].field === 'thumbnail'`
  - with `config.APP_ENV` mutated to `production` and `storageDeps.driver` replaced by one that throws `HTTP 403: <Error><Code>AccessDenied</Code>…`, the response is 500 `INTERNAL_ERROR` with message `Something went wrong` and a body containing neither `AccessDenied` nor the bucket name

### Upload hardening — configuration validation

- [ ] Add tests to `apps/api/src/config/env.test.ts`:
  - `UPLOAD_ALLOWED_TYPES='image/jpeg,image/gif'` fails with an issue on path `UPLOAD_ALLOWED_TYPES` whose message names `image/gif`
  - `'image/jpeg, image/png'` parses to `['image/jpeg', 'image/png']`
  - `UPLOAD_MAX_SIZE_BYTES` of `'0'`, `'-5'` or `'1.5'` fails
  - the default still parses to 10485760 and three types
- [ ] In `apps/api/src/config/env.ts`, change `UPLOAD_MAX_SIZE_BYTES` to `z.coerce.number().int().positive().default(10 * 1024 * 1024)`. Change `UPLOAD_ALLOWED_TYPES` to a string that is split, trimmed, lower-cased and filtered for empty entries, then refined against `SUPPORTED_IMAGE_MIME_TYPES` from `utils/upload/mime.ts` with an error naming the variable and the bad entries. Update `apps/api/src/utils/upload/index.ts` to read the parsed array instead of `split(',')`. Coordinate with, or rebase onto, the wave-6 track that edits the `S3_*`/`UPLOAD_DIR` lines of the same file

### Upload hardening — OpenAPI metadata

- [ ] Update `describeRoute()` for `POST /` in `apps/api/src/modules/photo/index.ts`:
  - add `413` (body over the photo cap) and `415` (unsupported image type) responses with `resolver(ErrorEnvelopeSchema)`
  - reword `400` to "Validation error, file too large, or invalid image"
  - extend `description` with the size, type and dimension constraints, and add part descriptions for `file` and `thumbnail` (max 1,200 px, max 1 MiB)
  - keep runtime behaviour unchanged
  - run `make test-specific filter=src/routes/openapi.coverage.test.ts`

### Upload hardening — web client error mapping

- [ ] In `apps/web/src/components/photos/PhotoUpload.tsx`, inside the `catch`, map `ApiError` `code` `FILE_TOO_LARGE`/`PAYLOAD_TOO_LARGE` → `photo.error.tooLarge` and `UNSUPPORTED_MEDIA_TYPE`/`INVALID_IMAGE` → `photo.error.unsupportedType`, otherwise keep `photo.error.uploadFailed`. Reuse the existing keys, so no new i18n is needed. Optionally send fixed part names (`photo`, `thumbnail.jpg`) so local filenames are not transmitted. Add a case to `PhotoUpload.test.tsx`. Coordinate with the photo-wiring track that mounts this component

### Upload hardening — docs

- [ ] `docs/api.md` Photos section:
  - document the server-generated key format (`<uuid>.<ext>`, `<uuid>_medium.<ext>`), content-based type detection, the dimension limits (16,384 px per side and 50 MP for originals; 1,200 px and 1 MiB for thumbnails) and the photo body cap
  - document the error codes `VALIDATION_ERROR`, `FILE_TOO_LARGE`, `INVALID_IMAGE` (400), `UNSUPPORTED_MEDIA_TYPE` (415), `PAYLOAD_TOO_LARGE` (413) and `INTERNAL_ERROR` (500), and note that `UPLOAD_ERROR` was removed
- [ ] `docs/decisions.md`: add the next free-numbered ADR, "Server-generated upload keys and built-in magic-byte sniffing". Record the rejected `file-type`/`image-size`/`sharp`/`busboy` alternatives, and cross-reference ADR-009
- [ ] `docs/deployment_coolify.md` §10:
  - step 3 says to scope the R2 token to the `brewform-uploads` bucket only ("Object Read & Write", specific bucket)
  - add a post-upgrade note for deployments that ran earlier versions: audit for unexpected keys, check bucket CORS/policy/ACL, and rotate the token if anything is found
- [ ] `AGENTS.md` "Middleware stack order" line: describe `bodyLimit` as 1 MB, with the photo upload cap on `/api/v1/photos`. Add commented `UPLOAD_MAX_SIZE_BYTES` / `UPLOAD_ALLOWED_TYPES` defaults with their constraints to the root `.env.example`
- [ ] Hand the orchestrator the proposed `request-body-limit` MODIFIED block from `audit/t4a-upload-security.md` §4: "Photo upload route exclusion" now uses the photo cap, and "Test coverage" replaces `deno test` with Vitest via `make test-specific`. Do this unless another track already owns that capability

### Upload hardening — verification

- [ ] Manual check against the dev Garage service (`make up`, `STORAGE_DRIVER=s3` pointed at Garage):
  - upload a JPEG through the API
  - confirm the object key is `<uuid>.jpg`, and the stored `Content-Type` (via `HEAD`) is `image/jpeg`
  - confirm a crafted-filename upload creates no object outside the bucket and no bucket-subresource change
- [ ] Run `make db-generate` and assert "No schema changes, nothing to migrate" (this track changes no schema)
- [ ] Run `make check`, `make lint`, `make test-api`, `make test-specific filter=src/middleware/bodyLimit.test.ts` and `make test-web` (for the `PhotoUpload` change), then `make fmt` and confirm `pnpm run fmt-check` is clean
