# api-env-config Specification

## Purpose

Defines how the API reads and validates its environment in `apps/api/src/config/env.ts`. Empty
values count as unset, ports and sizes are range-checked, the upload directory resolves to one
absolute, write-verified path, and the storage configuration is checked and logged at startup.
Validation errors name the variable but never print its value.

## Requirements
### Requirement: Empty environment values are treated as unset
The API environment loader (`apps/api/src/config/env.ts`) SHALL treat every variable whose value is an empty or whitespace-only string exactly as if the variable were not set, before any validation, coercion or defaulting runs.
This applies to every key of the exported `envSchema`. Optional variables then resolve to their
default (or `undefined`), and required variables (`DATABASE_URL`, `JWT_SECRET`) still fail with a
"required" error. This matches what Docker Compose produces for `${VAR:-}` interpolations and what
operators produce when they leave a value blank in a `.env` file or a Coolify variable.

#### Scenario: Blank optional URL variables boot with local storage
- **WHEN** the loader parses `STORAGE_DRIVER=local`, `S3_ENDPOINT=""`, `S3_PUBLIC_URL=""` and `PUBLIC_APP_URL=""` together with a valid `DATABASE_URL` and `JWT_SECRET`
- **THEN** parsing succeeds
- **AND** `config.S3_ENDPOINT`, `config.S3_PUBLIC_URL` and `config.PUBLIC_APP_URL` are `undefined`

#### Scenario: Blank numeric values fall back to their defaults
- **WHEN** the loader parses `APP_PORT=""`, `SMTP_PORT=""` and `UPLOAD_MAX_SIZE_BYTES=""`
- **THEN** `APP_PORT` is `8000`, `SMTP_PORT` is `1025` and `UPLOAD_MAX_SIZE_BYTES` is `10485760`
- **AND** none of them is coerced to `0`

#### Scenario: Blank enum and boolean values fall back to their defaults
- **WHEN** the loader parses `CACHE_ENABLED=""`, `CACHE_DRIVER=""`, `LOG_FORMAT=""` and `STORAGE_DRIVER=""`
- **THEN** parsing succeeds with `CACHE_ENABLED` `true`, `CACHE_DRIVER` `memory`, `LOG_FORMAT` `json` and `STORAGE_DRIVER` `local`

#### Scenario: Blank required values still fail
- **WHEN** the loader parses `JWT_SECRET=""` or `DATABASE_URL="   "`
- **THEN** parsing fails and the reported errors name the blank required variable

#### Scenario: S3 storage still requires non-blank S3 settings
- **WHEN** the loader parses `STORAGE_DRIVER=s3` with `S3_ENDPOINT=""` and the other `S3_*` values set
- **THEN** parsing fails with the message `S3_ENDPOINT is required when STORAGE_DRIVER is s3`

### Requirement: Port and size variables are range-checked
The API environment loader SHALL reject `APP_PORT` and `SMTP_PORT` values that are not integers between 1 and 65535, and SHALL reject `UPLOAD_MAX_SIZE_BYTES` values that are not positive integers.
Invalid values MUST fail validation at startup instead of silently producing `NaN`, `0` or a
negative limit.

#### Scenario: Non-numeric port is rejected
- **WHEN** the loader parses `APP_PORT=abc`
- **THEN** parsing fails and the reported errors name `APP_PORT`

#### Scenario: Out-of-range ports are rejected
- **WHEN** the loader parses `APP_PORT=0` or `SMTP_PORT=70000`
- **THEN** parsing fails and the reported errors name the offending variable

#### Scenario: Non-positive upload limit is rejected
- **WHEN** the loader parses `UPLOAD_MAX_SIZE_BYTES=-1` or `UPLOAD_MAX_SIZE_BYTES=0`
- **THEN** parsing fails and the reported errors name `UPLOAD_MAX_SIZE_BYTES`

#### Scenario: Valid numeric values are coerced
- **WHEN** the loader parses `APP_PORT=3000` and `UPLOAD_MAX_SIZE_BYTES=5242880`
- **THEN** parsing succeeds with the numbers `3000` and `5242880`

### Requirement: Upload directory resolves to one absolute path
The API environment loader SHALL resolve `UPLOAD_DIR` to an absolute filesystem path once, at load time, so that the local storage driver and the `/uploads/*` handler always read and write the same directory.
A relative value (including the default `./uploads`) is resolved against the process working
directory at startup. The production API image SHALL set `UPLOAD_DIR=/app/uploads`, which is the
path the production Compose file mounts the `uploads` volume on.

#### Scenario: Relative value is resolved against the working directory
- **WHEN** the API starts with `UPLOAD_DIR=./uploads` and working directory `/app/apps/api`
- **THEN** `config.UPLOAD_DIR` is `/app/apps/api/uploads`

#### Scenario: Absolute value is preserved
- **WHEN** the API starts with `UPLOAD_DIR=/app/uploads`
- **THEN** `config.UPLOAD_DIR` is `/app/uploads`

#### Scenario: Storage driver and uploads handler agree
- **WHEN** a file is saved through the local storage driver and then requested via `GET /uploads/<filename>`
- **THEN** the handler serves the bytes from the same absolute directory the driver wrote to

#### Scenario: Production image default matches the volume mount
- **WHEN** the API runtime image starts without an explicit `UPLOAD_DIR`
- **THEN** `config.UPLOAD_DIR` is `/app/uploads`

### Requirement: Storage configuration is verified and logged at startup
When `STORAGE_DRIVER` is `local`, the API SHALL, before it starts listening, create `UPLOAD_DIR` if it is missing, prove the process can write to it by creating and deleting a probe file, and log the storage driver and absolute upload directory at info level; if the directory cannot be created or the probe write fails it MUST log one error that names the directory, the process UID and GID and the ownership fix, and exit with status `1`.
The check lives in `apps/api/src/utils/storage/startup.ts` as
`verifyStorage(config, fsDeps, log)` with injectable `mkdir`, `writeFile`, `unlink`, `stat` and
`access` functions so it is unit-testable, and follows the logging rules (module-scoped logger,
entry/exit debug logs, `err` on error logs, no secrets or PII).

- The probe file is `<UPLOAD_DIR>/.brewform-write-test-<pid>`, written and then deleted. A real
  write catches every cause the same way: wrong ownership, mode bits, a read-only (`:ro`) mount,
  SELinux labels and NFS root squashing.
- The error message SHALL read like:
  `Upload directory /app/uploads is not writable by uid 1000 gid 1000 (EACCES). Give it to this user, for example: chown -R 1000:1000 <volume or host folder>. With compose.production.yml run: make prod-fix-uploads-owner`.
  The UID and GID come from `process.getuid()` and `process.getgid()`. The error code (`EACCES`,
  `EROFS`, `ENOENT`, ...) is included, and file contents and environment values never are.
- `verifyStorage` SHALL return `{ storageDriver, uploadDir, mounted }`, where `mounted` is `false`
  only when `APP_ENV=production` and `stat(UPLOAD_DIR).dev` equals `stat(parent).dev`. It records
  `mounted` so the readiness probe can report `storage: "ephemeral"` (production-operations
  capability). `checkStorageHealth()` in the same module returns `ok`, `ephemeral`, `degraded` or
  `s3` for `/ready`, using a single `access(UPLOAD_DIR, W_OK)` call per probe.

#### Scenario: Local storage startup is logged
- **WHEN** the API starts with `STORAGE_DRIVER=local` and a writable `UPLOAD_DIR=/app/uploads`
- **THEN** an info log contains `storageDriver: 'local'` and `uploadDir: '/app/uploads'`
- **AND** no probe file remains in `/app/uploads`
- **AND** the server starts listening afterwards

#### Scenario: Unwritable upload directory fails fast
- **WHEN** the API starts with `STORAGE_DRIVER=local` and `UPLOAD_DIR` exists but is not writable by the process user
- **THEN** one error log names the directory, the process UID and GID and the `chown -R 1000:1000` fix
- **AND** the process exits with status `1` without listening on `APP_PORT`

#### Scenario: Root-owned bind mount fails startup with a clear error
- **WHEN** the API container starts with `/app/uploads` bind-mounted from a host folder owned by `root` with mode `0755`
- **THEN** the container logs contain `Upload directory /app/uploads is not writable by uid 1000 gid 1000` and `make prod-fix-uploads-owner`
- **AND** the container exits with status `1` and never reports `healthy`

#### Scenario: Read-only mount fails startup
- **WHEN** the API container starts with `/app/uploads` mounted read-only (`:ro`)
- **THEN** the error log contains `EROFS` and the process exits with status `1`

#### Scenario: Production upload directory that is not a mount point is flagged
- **WHEN** the API starts with `APP_ENV=production`, `STORAGE_DRIVER=local` and an `UPLOAD_DIR` that is on the same device as its parent directory
- **THEN** a warn log states that `UPLOAD_DIR` is not a mounted volume and files will be lost when the container is recreated
- **AND** startup continues and `GET /ready` reports `storage: "ephemeral"`

#### Scenario: S3 storage skips the local directory check
- **WHEN** the API starts with `STORAGE_DRIVER=s3` and valid `S3_*` settings
- **THEN** an info log contains `storageDriver: 's3'` and the bucket name
- **AND** no access key, secret key or local directory check appears in the logs

### Requirement: Environment validation errors never print values
When environment validation fails, the API SHALL report each failing variable name with its validation message and MUST NOT print the offending values.
Values such as `JWT_SECRET`, `DATABASE_URL` (which embeds a password), `REDIS_URL` and `S3_SECRET_KEY`
are secrets, so the startup error output names variables only.

#### Scenario: Short secret is reported without its value
- **WHEN** the API starts with `JWT_SECRET=tooshort`
- **THEN** the error output names `JWT_SECRET` with a minimum-length message
- **AND** the string `tooshort` does not appear in the output

#### Scenario: Malformed URL is reported without its value
- **WHEN** the API starts with `STORAGE_DRIVER=s3` and `S3_ENDPOINT=not a url`
- **THEN** the error output names `S3_ENDPOINT`
- **AND** the string `not a url` does not appear in the output

