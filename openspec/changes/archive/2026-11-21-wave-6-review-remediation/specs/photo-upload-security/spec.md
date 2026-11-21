## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Best-effort cleanup of partially persisted uploads

When a storage write or the photo row insert fails, the system SHALL attempt a best-effort `delete`, through the storage driver, of every object key it tried to write for the same upload, including the key whose write failed (a failed local write can leave a partial file, and a timed-out S3 PUT can still have stored the object), and SHALL log a `warn` if the cleanup fails, while still surfacing the original failure to the global error handler.

A key whose write failed with `EEXIST` SHALL NOT be deleted, because that object belongs to another upload (see "Uploads never overwrite an existing object").

#### Scenario: Thumbnail write failure removes the stored original

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
