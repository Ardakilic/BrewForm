# photo-upload-security Specification

## Purpose
TBD - created by archiving change wave-6-audit-remediation. Update Purpose after archive.
## Requirements
### Requirement: Server-generated random storage keys

The system SHALL generate every stored upload object key on the server from `crypto.randomUUID()` plus an extension looked up in a fixed MIME-to-extension table, and SHALL NOT include any character derived from the client-supplied multipart filename, form fields, or declared Content-Type in the key or in the public URL.

The fixed table SHALL be exactly `image/jpeg` → `jpg`, `image/png` → `png`, `image/webp` → `webp`. Original
photo keys SHALL match `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$`.
Thumbnail keys SHALL reuse the original's UUID, SHALL match
`^<same-uuid>_medium\.(jpg|png|webp)$`, and SHALL take their extension from the thumbnail's own detected
type (not from the original's). The key generator SHALL NOT accept the client filename as an input.

#### Scenario: Crafted traversal filename cannot influence the key

- **WHEN** the recipe owner uploads a valid JPEG whose multipart filename is `a.x/%2e%2e/%2e%2e/other-bucket/payload`
- **THEN** the upload succeeds with HTTP 201
- **AND** the stored object key matches the original-key pattern and ends in `.jpg`
- **AND** the returned `url` and `thumbnailUrl` contain none of `other-bucket`, `payload`, `%2e`, or `..`

#### Scenario: Query-string injection through the filename is impossible

- **WHEN** the recipe owner uploads a valid PNG whose multipart filename is `a.x/%2e%2e?policy=`
- **THEN** the storage write targets the path `/<S3_BUCKET>/<uuid>.png` with an empty query string
- **AND** no request is sent to a bucket-level subresource such as `?policy=`, `?cors=`, `?acl=`, or `?tagging=`

#### Scenario: Identical filenames produce distinct keys

- **WHEN** the same file named `photo.jpg` is uploaded twice to the same recipe
- **THEN** the two photo records have different keys and different `url` values

#### Scenario: Thumbnail key shares the original's UUID but uses its own type

- **WHEN** the recipe owner uploads a PNG original together with a JPEG thumbnail
- **THEN** the original key is `<uuid>.png` and the thumbnail key is `<uuid>_medium.jpg` with the same `<uuid>`

### Requirement: Content-based image type detection

The system SHALL determine the type of every uploaded image part (original and thumbnail) from its leading bytes with a built-in magic-byte detector for JPEG, PNG, and WebP, and SHALL treat the client-declared part Content-Type and filename extension as untrusted hints only.

The detector SHALL recognise JPEG by the prefix `FF D8 FF`, PNG by the 8-byte signature
`89 50 4E 47 0D 0A 1A 0A` followed by an `IHDR` chunk at offset 12, and WebP by `RIFF` at offset 0 and
`WEBP` at offset 8 followed by a `VP8 `, `VP8L`, or `VP8X` chunk. The effective allowlist SHALL be the
intersection of the detector's types and `UPLOAD_ALLOWED_TYPES`. A part whose detected type is unknown or
not in the effective allowlist SHALL be rejected with HTTP 415 and error code `UNSUPPORTED_MEDIA_TYPE`. A
part whose declared Content-Type is non-empty, is not `application/octet-stream`, and is not in the
effective allowlist SHALL also be rejected with HTTP 415. When the declared and detected types are both
allowed but differ, the detected type SHALL win for the key extension and the stored Content-Type. The
error message SHALL be a fixed server string that lists the allowed formats and SHALL NOT echo the
client-declared type or filename.

#### Scenario: HTML disguised as a JPEG is rejected

- **WHEN** a part contains `<html><script>alert(1)</script></html>` and declares `Content-Type: image/jpeg` with filename `photo.jpg`
- **THEN** the system returns HTTP 415 with code `UNSUPPORTED_MEDIA_TYPE`
- **AND** no object is written to storage and no photo row is created

#### Scenario: SVG and GIF bytes are rejected

- **WHEN** a part contains SVG markup or a `GIF89a` image while declaring `image/png`
- **THEN** the system returns HTTP 415 with code `UNSUPPORTED_MEDIA_TYPE`

#### Scenario: Disallowed declared type is rejected even with image bytes

- **WHEN** a part contains valid JPEG bytes but declares `Content-Type: text/html`
- **THEN** the system returns HTTP 415 with code `UNSUPPORTED_MEDIA_TYPE`

#### Scenario: Mislabelled but allowed image is stored under its real type

- **WHEN** a part contains valid PNG bytes but declares `image/jpeg` with filename `photo.jpg`
- **THEN** the upload succeeds with HTTP 201
- **AND** the stored key ends in `.png` and the stored Content-Type is `image/png`

#### Scenario: Operator-narrowed allowlist is enforced

- **WHEN** `UPLOAD_ALLOWED_TYPES=image/jpeg,image/png` and a valid WebP is uploaded
- **THEN** the system returns HTTP 415 with code `UNSUPPORTED_MEDIA_TYPE`

#### Scenario: Rejection message does not reflect client input

- **WHEN** a part declaring `Content-Type: x-evil/<script>` is rejected
- **THEN** the response `error.message` does not contain `x-evil` or `<script>`

### Requirement: Image dimension and decompression-bomb guard

The system SHALL read pixel dimensions from the detected image header (PNG `IHDR`, JPEG `SOF0`–`SOF15` excluding `C4`/`C8`/`CC`, WebP `VP8 `/`VP8L`/`VP8X`) without decoding pixel data, and SHALL reject with HTTP 400 and error code `INVALID_IMAGE` any part whose dimensions cannot be read, are zero, or exceed the configured limits.

Limits SHALL be: originals at most 16,384 px on either side and at most 50,000,000 total pixels;
thumbnails at most 1,200 px on either side. The error response SHALL identify the offending part in
`error.details[].field` (`file` or `thumbnail`).

#### Scenario: PNG decompression bomb header is rejected

- **WHEN** a part is a PNG whose `IHDR` declares 65535 × 65535 pixels
- **THEN** the system returns HTTP 400 with code `INVALID_IMAGE`
- **AND** no object is written to storage

#### Scenario: JPEG without a frame header is rejected

- **WHEN** a part starts with `FF D8 FF` but reaches `SOS` or end-of-data before any `SOFn` marker
- **THEN** the system returns HTTP 400 with code `INVALID_IMAGE`

#### Scenario: Large real camera photo is accepted

- **WHEN** the recipe owner uploads a 6016 × 6016 JPEG under `UPLOAD_MAX_SIZE_BYTES`
- **THEN** the upload succeeds with HTTP 201

#### Scenario: Oversized thumbnail dimensions are rejected

- **WHEN** a valid original is uploaded with a 2000 × 2000 JPEG thumbnail
- **THEN** the system returns HTTP 400 with code `INVALID_IMAGE` and `error.details[0].field` equal to `thumbnail`

### Requirement: Per-part size limits

The system SHALL reject an original image part larger than `UPLOAD_MAX_SIZE_BYTES`, and a thumbnail part larger than the thumbnail cap of `min(1 MiB, UPLOAD_MAX_SIZE_BYTES)`, with HTTP 400 and error code `FILE_TOO_LARGE`, identifying the offending part in `error.details[].field`.

An empty (zero-byte) or absent thumbnail part SHALL be treated as "no thumbnail", and the photo's
`thumbnailUrl` SHALL then equal its `url`.

#### Scenario: Original one byte over the limit is rejected

- **WHEN** an original part of `UPLOAD_MAX_SIZE_BYTES + 1` bytes is uploaded within the photo body cap
- **THEN** the system returns HTTP 400 with code `FILE_TOO_LARGE` and `error.details[0].field` equal to `file`

#### Scenario: Oversized thumbnail is rejected

- **WHEN** a valid original is uploaded with a 2 MiB thumbnail part
- **THEN** the system returns HTTP 400 with code `FILE_TOO_LARGE` and `error.details[0].field` equal to `thumbnail`

#### Scenario: Missing thumbnail falls back to the original URL

- **WHEN** a valid original is uploaded with no thumbnail part or a zero-byte thumbnail part
- **THEN** the upload succeeds and the returned `thumbnailUrl` equals the returned `url`

### Requirement: Thumbnails validated identically and before any write

The system SHALL apply the same type detection, allowlist, dimension, and size validation to the optional thumbnail part as to the original, and SHALL complete validation of every part before writing any bytes to storage.

A thumbnail that fails validation SHALL fail the whole upload; the system SHALL NOT silently drop it and
SHALL NOT store the original.

#### Scenario: Invalid thumbnail rejects the whole upload

- **WHEN** a valid JPEG original is uploaded with a thumbnail part containing HTML bytes
- **THEN** the system returns HTTP 415 with code `UNSUPPORTED_MEDIA_TYPE` and `error.details[0].field` equal to `thumbnail`
- **AND** zero objects are written to storage and no photo row is created

#### Scenario: Valid original and thumbnail are both stored

- **WHEN** a valid original and a valid thumbnail are uploaded by the recipe owner
- **THEN** both objects are written and the photo row's `thumbnailUrl` points at the `<uuid>_medium.<ext>` key

### Requirement: Bounded request body on photo routes

The system SHALL enforce a request body cap on every `/api/v1/photos` route equal to `UPLOAD_MAX_SIZE_BYTES` plus the thumbnail cap plus 64 KiB of multipart overhead, and SHALL reject larger bodies with HTTP 413 and error code `PAYLOAD_TOO_LARGE` before the body is parsed, replacing the previous behaviour of skipping body-size enforcement for photo routes.

All other routes SHALL keep the existing 1 MB limit. The 413 response SHALL use the standard error
envelope including `requestId`.

#### Scenario: Declared oversized body is rejected without reading it

- **WHEN** a client sends `POST /api/v1/photos` with a `Content-Length` larger than the photo body cap
- **THEN** the system returns HTTP 413 with code `PAYLOAD_TOO_LARGE`
- **AND** the photo handler is never invoked and `formData()` is never called

#### Scenario: Streamed oversized body is rejected at the cap

- **WHEN** a client sends `POST /api/v1/photos` with chunked transfer encoding and a body larger than the photo body cap
- **THEN** the system returns HTTP 413 with code `PAYLOAD_TOO_LARGE` after reading at most cap-plus-one-chunk bytes
- **AND** the photo handler is never invoked

#### Scenario: Normal photo upload passes the cap

- **WHEN** a client uploads a 9 MB JPEG plus a 200 KB thumbnail to `POST /api/v1/photos` with default configuration
- **THEN** the request reaches the photo handler

#### Scenario: Non-photo routes keep the 1 MB limit

- **WHEN** a client sends a 2 MB JSON body to `/api/v1/photoshop` or any other non-photo route
- **THEN** the system returns HTTP 413 with code `PAYLOAD_TOO_LARGE`

### Requirement: Storage drivers reject unsafe keys

Every storage driver (`S3StorageDriver` and `LocalStorageDriver`) SHALL validate the object key against `^[A-Za-z0-9][A-Za-z0-9_-]{0,127}(\.[A-Za-z0-9]{1,8})?$` before any network or filesystem I/O, and SHALL throw for any key that does not match, including keys that contain `/`, `\`, `..`, `%`, `?`, `#`, whitespace, or a leading `.`.

This check SHALL apply to both `save` and `delete`, independent of the key generator, as defence in
depth.

#### Scenario: S3 driver refuses a traversal key without sending a request

- **WHEN** `S3StorageDriver.save` is called with the key `1-a.x/%2e%2e/%2e%2e/other-bucket/payload`
- **THEN** it throws an invalid-key error
- **AND** `fetch` is never called

#### Scenario: S3 driver refuses a query-bearing key

- **WHEN** `S3StorageDriver.save` or `S3StorageDriver.delete` is called with the key `abc.png?policy=`
- **THEN** it throws an invalid-key error and `fetch` is never called

#### Scenario: Local driver refuses a nested key

- **WHEN** `LocalStorageDriver.save` is called with the key `abc.x/sub/evil`
- **THEN** it throws an invalid-key error and no file or directory is created under `UPLOAD_DIR`

#### Scenario: Generated keys pass the guard

- **WHEN** either driver is called with a key produced by the server key generator
- **THEN** the key is accepted

### Requirement: S3 request target integrity

The S3 storage driver SHALL build the request path as `/<bucket>/<key>` by URI-encoding the bucket and each key segment with the AWS SigV4 `UriEncode` rule (percent-encode every byte except `A-Z a-z 0-9 - . _ ~`, encoding once), SHALL sign exactly that path as the canonical URI with an empty canonical query string, and SHALL abort without sending if the parsed request URL's pathname or query differs from the signed values.

#### Scenario: Signed path equals the sent path

- **WHEN** `S3StorageDriver.save` is called with a valid generated key
- **THEN** the URL passed to `fetch` has pathname `/<S3_BUCKET>/<key>` and an empty search component
- **AND** the canonical URI used for signing equals that pathname

#### Scenario: Normalisation mismatch aborts the request

- **WHEN** the URL parser would normalise the built path to a different pathname or produce a non-empty query
- **THEN** the driver throws before calling `fetch`

#### Scenario: Endpoint with a path prefix is refused at construction

- **WHEN** `S3StorageDriver` is constructed with `S3_ENDPOINT=https://s3.example.com/brewform-uploads` (a bucket path) or an endpoint carrying a query or fragment
- **THEN** the constructor throws an error naming `S3_ENDPOINT` and stating that it must be the account endpoint with no path, and no request is ever sent

### Requirement: No client-supplied filename can alter a signed S3 request

The client-supplied multipart filename SHALL NOT be read by the photo controller or passed to any service, key generator or storage driver, so that no upload can change the HTTP method, host, bucket, object path or query string of any request the S3 driver signs, including bucket and object subresources such as `?policy`, `?acl`, `?cors`, `?tagging`, `?lifecycle`, `?versioning`, `?website`, `?uploads`, `?uploadId` and `?partNumber`.

This closes the audit-missed escalation confirmed in `openspec/changes/archive/2026-11-21-wave-6-audit-remediation/audit/t4a-upload-security.md` rows 3a-3c: the
pre-change key `${Date.now()}-${uuid8}.${originalName.split('.').pop()}`
(`apps/api/src/utils/upload/index.ts:53-58`) carried `a.x/%2e%2e?policy=` into the unencoded URL
(`apps/api/src/utils/storage/s3.ts:28-29`), and `signRequest` signed `new URL(url).pathname` and
`.search` (`s3.ts:88,113-114`), producing a valid signed bucket-configuration `PUT` (or an object
`?tagging=` `PUT`, or an overwrite of `/<bucket>/<victim-key>`). The `POST /api/v1/photos` handler
SHALL pass only `{ declaredType, size, data }` for each part; the `uploadPhoto` input type SHALL
have no `name` field. Every request the S3 driver sends SHALL be a `PUT` or `DELETE` to
`<S3_ENDPOINT origin>/<bucket>/<server-generated key>` with an empty query string.

#### Scenario: The filename is never read

- **WHEN** a test posts a multipart upload whose `file` part is a `File` subclass with a valid JPEG body and a `name` getter that throws
- **THEN** the upload succeeds with HTTP 201, proving the controller never reads `name`

#### Scenario: Subresource and traversal filenames produce a plain object PUT

- **WHEN** the recipe owner uploads valid images through the S3 driver (with `fetch` mocked) using each multipart filename `a.x/%2e%2e?policy=`, `a.x/%2e%2e?cors=`, `a.x?acl=`, `a.x?tagging=`, `a.x?uploads=`, `a.x?partNumber=1&uploadId=1`, `a.x/%2e%2e/%2e%2e/other-bucket/payload` and `../1731000000000-abcd1234.jpeg`
- **THEN** every `fetch` call is a `PUT` whose URL has pathname `/<S3_BUCKET>/<uuid>.<ext>` (or `<uuid>_medium.<ext>`) and an empty search component
- **AND** the canonical request used for signing has an empty canonical query string
- **AND** no `fetch` call targets a different bucket, the bucket root, or a key that was not generated in the same request

### Requirement: Uploads never overwrite an existing object

Every storage write SHALL target a key generated by `generateStorageKey` (or `thumbnailKey` from the same id) within the same upload request, so that no upload can replace an object stored by another upload, another user, or a pre-change version of the app.

The photo service SHALL NOT call `save` with any key it did not generate in the same request, and
SHALL NOT accept a key from the client. `LocalStorageDriver.save` SHALL create the file with an
exclusive-create write (`writeFile(path, data, { flag: 'wx' })`) and SHALL throw (surfacing as 500
`INTERNAL_ERROR`, with best-effort cleanup of earlier writes) instead of replacing an existing file.
The S3 driver relies on UUIDv4 keys (122 random bits) and does not send `If-None-Match`, because
support for conditional `PutObject` is not uniform across the S3-compatible providers BrewForm
documents (Garage, R2, MinIO); its retry loop SHALL re-send only the same `PUT` to the same key.

#### Scenario: A filename equal to an existing key does not replace it

- **WHEN** a file `1731000000000-abcd1234.jpeg` (a legacy key) and a file `<uuid-A>.jpg` (another user's key) exist in the test `UPLOAD_DIR`, and the recipe owner uploads a valid JPEG named `1731000000000-abcd1234.jpeg`, and then another named `<uuid-A>.jpg`
- **THEN** both uploads are stored under new `<uuid>.jpg` keys
- **AND** the bytes of both pre-existing files are byte-identical to before

#### Scenario: Local driver refuses to replace a file

- **WHEN** `LocalStorageDriver.save` is called twice with the same safe key
- **THEN** the second call throws and the file holds the bytes of the first call

### Requirement: Operators are guided to audit buckets exposed to pre-change versions

The deployment documentation SHALL tell operators of any deployment that ran a pre-wave-6 version with `STORAGE_DRIVER=s3` how to detect and undo bucket-configuration changes and overwrites made through crafted filenames, and how to scope the storage credential so a future bug cannot reach bucket configuration.

The section SHALL appear in `docs/deployment_coolify.md` §10 and in `docs/deployment_compose.md`
(the "Upgrading from the pre-wave-6 compose file" part), and SHALL be linked from the release notes.
It SHALL give copy-pasteable commands using the AWS CLI with `--endpoint-url "$S3_ENDPOINT"`:

- Inspect bucket configuration: `aws s3api get-bucket-policy`, `get-bucket-acl`, `get-bucket-cors`,
  `get-bucket-tagging`, `get-bucket-lifecycle-configuration`, `get-bucket-versioning` and
  `get-bucket-website`, each with `--bucket "$S3_BUCKET"`. BrewForm sets none of these, so any
  policy, CORS rule, tag, lifecycle rule or website configuration the operator did not create is a
  finding. `NoSuchBucketPolicy`/`NoSuchCORSConfiguration`-style errors mean "not set".
- Inspect objects: `aws s3api list-objects-v2 --bucket "$S3_BUCKET"` and flag every key that matches
  neither the legacy pattern `^[0-9]{13}-[0-9a-f]{8}\.[A-Za-z0-9]+$` (plus `_medium`) nor the new
  `<uuid>.<ext>` pattern, every object with a `?` or `/` in its key, and the tag sets
  (`get-object-tagging`) of a sample of legacy objects.
- Compare the `photo` table's `url`/`thumbnail_url` values against the listed keys to find photos
  whose object was replaced (size or `LastModified` later than the photo row's `created_at`).
- Remediate: delete unexpected bucket policy/CORS/tagging/lifecycle/website configuration,
  restore overwritten objects from backup, and rotate the access key whenever any finding exists.
- Scope the credential to object read/write on the one bucket: Cloudflare R2 "Object Read & Write"
  limited to the bucket (never "Admin Read & Write"); Garage `garage bucket allow --read --write
  <bucket> --key <key>` without `--owner`; AWS or MinIO a policy granting only `s3:GetObject`,
  `s3:PutObject` and `s3:DeleteObject` on `arn:aws:s3:::<bucket>/*`.

#### Scenario: Remediation steps are documented

- **WHEN** an operator reads `docs/deployment_coolify.md` §10 or `docs/deployment_compose.md`
- **THEN** they find the bucket-configuration inspection commands, the object-key audit with both key patterns, the photo-row comparison, the rotate-on-finding rule and the per-provider credential scoping

### Requirement: Explicit Content-Type on stored objects

The S3 storage driver SHALL send a `Content-Type` header equal to the server-detected MIME type on every object PUT and SHALL include `content-type` in the SigV4 `SignedHeaders`, and the local `/uploads/*` handler SHALL serve files with the Content-Type mapped from the server-generated extension together with `X-Content-Type-Options: nosniff`.

The `StorageDriver.save` contract SHALL require the content type from the caller; drivers SHALL NOT infer
it from the key or from client input.

#### Scenario: S3 PUT carries a signed Content-Type

- **WHEN** a detected PNG is saved through `S3StorageDriver`
- **THEN** the PUT request has header `content-type: image/png`
- **AND** the `authorization` header's `SignedHeaders` list contains `content-type`

#### Scenario: Local file is served with its image type and nosniff

- **WHEN** a client requests `/uploads/<uuid>.webp` from the local driver
- **THEN** the response has `content-type: image/webp` and `x-content-type-options: nosniff`

### Requirement: Upload errors never leak internals

The photo upload route SHALL return only fixed, server-authored messages for its 4xx responses (`VALIDATION_ERROR`, `FILE_TOO_LARGE`, `INVALID_IMAGE`, `UNSUPPORTED_MEDIA_TYPE`, `NOT_FOUND`, `FORBIDDEN`, `PAYLOAD_TOO_LARGE`), and SHALL rethrow every other error to the global `app.onError` handler, so storage, filesystem, and database failures produce HTTP 500 `INTERNAL_ERROR` with no internal text in production.

The catch-all `UPLOAD_ERROR` response that echoed `err.message` SHALL be removed. Known upload validation
failures SHALL be represented by a typed error (carrying code, HTTP status, part field, and a safe
message) rather than by matching free-form message strings.

#### Scenario: S3 failure does not reveal storage details

- **WHEN** `APP_ENV=production` and the S3 endpoint answers the PUT with HTTP 403 and an `AccessDenied` XML body
- **THEN** the client receives HTTP 500 with code `INTERNAL_ERROR` and message `Something went wrong`
- **AND** the response body contains none of `AccessDenied`, `Signature`, the S3 endpoint host, or the bucket name
- **AND** the error is logged server-side with `err` and `requestId`

#### Scenario: Database failure does not reveal SQL

- **WHEN** `APP_ENV=production` and the photo row insert throws a Drizzle query error
- **THEN** the client receives HTTP 500 with code `INTERNAL_ERROR` and the body contains no SQL text or parameters

#### Scenario: Local filesystem failure does not reveal paths

- **WHEN** `APP_ENV=production` and the local driver fails to write the file
- **THEN** the response body contains no absolute filesystem path and no `ENOENT` text

#### Scenario: Ownership errors keep their mapping

- **WHEN** a non-author uploads to an existing recipe, or anyone uploads to a missing recipe
- **THEN** the system returns HTTP 403 `FORBIDDEN` or HTTP 404 `NOT_FOUND` respectively with fixed messages

### Requirement: Best-effort cleanup of partially persisted uploads

When a storage write or the photo row insert fails after one or more objects were already written for the same upload, the system SHALL attempt a best-effort `delete` of those objects through the storage driver and SHALL log a `warn` if the cleanup fails, while still surfacing the original failure to the global error handler.

#### Scenario: Thumbnail write failure removes the stored original

- **WHEN** the original is written successfully and the thumbnail write throws
- **THEN** the driver's `delete` is called with the original's key
- **AND** the client receives HTTP 500 `INTERNAL_ERROR` and no photo row exists

#### Scenario: Cleanup failure is logged, not masked

- **WHEN** the photo row insert fails and the subsequent cleanup `delete` also throws
- **THEN** a `warn` log records the cleanup failure with the key and `requestId`
- **AND** the client still receives HTTP 500 `INTERNAL_ERROR`

### Requirement: Legacy uploads keep resolving

The system SHALL keep serving and returning photos stored before this change under their existing keys and URLs without any data migration, because photo rows store full public URLs rather than keys.

The local `/uploads/*` read handler SHALL keep its existing traversal guards and SHALL NOT apply the new
generated-key pattern to reads.

#### Scenario: Legacy local file is still served

- **WHEN** a photo row created before this change has `url` `/uploads/1731000000000-abcd1234.jpeg` and the file exists in `UPLOAD_DIR`
- **THEN** `GET /uploads/1731000000000-abcd1234.jpeg` returns the file with `content-type: image/jpeg`

#### Scenario: Legacy S3 URLs are returned unchanged

- **WHEN** photos created before this change are listed
- **THEN** their `url` and `thumbnailUrl` values are returned exactly as stored

### Requirement: Upload configuration validated at startup

The API configuration SHALL fail fast at startup when `UPLOAD_ALLOWED_TYPES` contains any entry outside `image/jpeg`, `image/png`, and `image/webp`, or when `UPLOAD_MAX_SIZE_BYTES` is not a positive integer, with an error message naming the offending variable.

Entries in `UPLOAD_ALLOWED_TYPES` SHALL be trimmed of surrounding whitespace and SHALL be compared
case-insensitively; empty entries SHALL be ignored.

#### Scenario: Unsupported allowlist entry fails boot

- **WHEN** the API starts with `UPLOAD_ALLOWED_TYPES=image/jpeg,image/gif`
- **THEN** configuration parsing fails with a message naming `UPLOAD_ALLOWED_TYPES` and `image/gif`

#### Scenario: Non-positive size limit fails boot

- **WHEN** the API starts with `UPLOAD_MAX_SIZE_BYTES=0` or `UPLOAD_MAX_SIZE_BYTES=-5`
- **THEN** configuration parsing fails with a message naming `UPLOAD_MAX_SIZE_BYTES`

#### Scenario: Whitespace in the allowlist is tolerated

- **WHEN** the API starts with `UPLOAD_ALLOWED_TYPES=image/jpeg, image/png`
- **THEN** both `image/jpeg` and `image/png` are allowed

### Requirement: Upload route OpenAPI contract

The `POST /api/v1/photos` `describeRoute()` metadata SHALL document responses `201`, `400`, `401`, `403`, `404`, `413`, and `415`, each error with `resolver(ErrorEnvelopeSchema)`, and SHALL describe the size, type, and dimension constraints, without changing runtime behaviour.

#### Scenario: Spec lists the new error responses

- **WHEN** `GET /api/v1/openapi.json` is fetched with `OPENAPI_ENABLED` on
- **THEN** the `post` operation for `/api/v1/photos` lists responses `413` and `415` referencing the error envelope
- **AND** `apps/api/src/routes/openapi.coverage.test.ts` passes

### Requirement: Upload security events are logged

The photo upload path SHALL emit structured logs: `debug` entry and exit for `uploadPhoto`, `warn` for every rejected part (with reason code, part field, declared MIME, detected MIME, byte size, `userId`, `recipeId`), `warn` for photo body-cap rejections (with path, limit, and `requestId`), and `error` with `err` for storage or database failures, and SHALL NOT log the client-supplied filename, file bytes, or storage credentials.

#### Scenario: Rejected upload is logged without the filename

- **WHEN** an upload named `holiday-at-home.jpg` is rejected as `UNSUPPORTED_MEDIA_TYPE`
- **THEN** a `warn` log entry contains `reason: 'UNSUPPORTED_MEDIA_TYPE'` and `field: 'file'`
- **AND** no log entry contains `holiday-at-home`

#### Scenario: Successful upload logs the server key only

- **WHEN** an upload succeeds
- **THEN** an `info` log records the photo id, server-generated key, detected MIME, and size, and does not contain the client filename

### Requirement: Regression test coverage for upload hardening

The upload hardening SHALL be covered by Vitest tests that fail on the pre-change code: key generation and the driver key guard, the magic-byte and dimension detector, S3 request construction with a mocked `fetch` (including the subresource and traversal filename table and the empty canonical query), the never-read filename, no overwrite of an existing object (local exclusive create), the S3 endpoint path guard, the photo body cap, thumbnail validation, error mapping without leakage, and partial-write cleanup.

#### Scenario: Hardening suite passes under make test-api

- **WHEN** `make test-api` runs against the provisioned `brewform_test` database
- **THEN** `apps/api/src/utils/upload/sniff.test.ts`, `apps/api/src/utils/upload/index.test.ts`, `apps/api/src/utils/storage/key.test.ts`, `apps/api/src/utils/storage/s3.test.ts`, `apps/api/src/utils/storage/storage.test.ts`, `apps/api/src/middleware/bodyLimit.test.ts`, `apps/api/src/modules/photo/service.test.ts`, and `apps/api/src/modules/photo/index.test.ts` all pass

#### Scenario: Traversal regression test fails on the old implementation

- **WHEN** the traversal-filename test in `apps/api/src/modules/photo/index.test.ts` (a multipart `POST /api/v1/photos` whose filename is `a.x/%2e%2e/%2e%2e/other-bucket/payload`) is run against the pre-change code
- **THEN** it fails because the returned `url` contains `other-bucket` (the route-level test keeps passing after the service stops receiving filenames)

