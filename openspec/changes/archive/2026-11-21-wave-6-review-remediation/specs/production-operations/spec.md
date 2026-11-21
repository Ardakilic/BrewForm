## ADDED Requirements

### Requirement: Self-hosting guide documents the front-proxy client-IP contract
The self-hosting guide and `.env.production.example` SHALL state that a proxy in front of the web edge, when it connects from an address in `TRUSTED_PROXIES`, MUST append its peer address to or replace `X-Forwarded-For`, and that only that proxy may reach the web port.

- The guide SHALL give working front-proxy examples for nginx (with
  `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` and a `client_max_body_size` above
  the photo cap), Caddy (default `reverse_proxy`) and Traefik (default forwarded-headers handling,
  never `notAppendXForwardedFor`).
- It SHALL explain that a TCP (layer 4) forwarder on a private address passes client headers through
  and therefore needs `TRUSTED_PROXIES` set to that forwarder's address or empty.
- It SHALL show `WEB_PORT=127.0.0.1:<port>` for a proxy on the same host and a firewall rule for a
  proxy on a private network.
- The default `TRUSTED_PROXIES=private_ranges` stays.

#### Scenario: nginx operator gets a safe configuration
- **WHEN** an operator configures nginx in front of the stack from the guide's example
- **THEN** a request with a forged `X-Forwarded-For` reaches the API with the client's real address as its client IP
- **AND** a photo upload under the API cap is not rejected by nginx

#### Scenario: Same-host proxy cannot be bypassed
- **WHEN** `WEB_PORT=127.0.0.1:8080` is set as the guide recommends for a proxy on the same host
- **THEN** the web port accepts connections only on the loopback interface

## MODIFIED Requirements

### Requirement: Automated database backups
`compose.production.yml` SHALL include a `backup` service, enabled by default, that writes a compressed `pg_dump` of the application database to `/backups`, mounted from `${BACKUPS_SOURCE:-backups}` (the named `backups` volume by default, or a host folder), at start-up and then on a configurable interval, and whose scheduled runs delete dumps older than a configurable retention period.

- Settings: `BACKUPS_SOURCE` (default: the named volume `backups`; a path such as `./backups`
  selects a host folder, following the data-source rule above), `BACKUP_INTERVAL_SECONDS` (default
  `86400`) and `BACKUP_RETENTION_DAYS` (default `14`).
- The service SHALL use the same `postgres` image as the database so `pg_dump` matches the server
  version, and SHALL write each dump to a temporary name and rename it only after `pg_dump`
  succeeds, so an interrupted run never leaves a file named like a complete dump.
- Dumps SHALL be named `db-<UTC timestamp>.dump` (for example `db-20261118T000000Z.dump`) in
  `pg_dump` custom format, and SHALL be created under `umask 077` (mode `0600`), because they hold
  every user's data.
- A failed run SHALL be logged and retried at the next interval, and the service health check SHALL
  turn unhealthy when no dump newer than twice the interval exists.
- Only scheduled runs prune, and only after a successful run. A one-shot run SHALL NOT prune, so a
  manual or safety backup never deletes an imported dump that is about to be restored.
- `make prod-backup` SHALL trigger one immediate backup (`BACKUP_ONESHOT=1` through
  `docker compose run --rm backup`) and exit non-zero when it fails.
- `make prod-backup-export DEST=<dir>` SHALL copy the whole backups target to a host directory with
  `docker compose cp backup:/backups/. <dir>`, so off-host copies work the same way for a named
  volume and a host folder.

#### Scenario: Backup is written on start-up
- **WHEN** the stack starts with default backup settings
- **THEN** `docker compose exec backup ls /backups` lists a `db-<timestamp>.dump` shortly after the database is healthy
- **AND** `pg_restore --list` succeeds on that file

#### Scenario: A host folder receives the backups
- **WHEN** `BACKUPS_SOURCE=./backups` is set and a backup run completes
- **THEN** the dump appears in `./backups` on the host with mode `0600`

#### Scenario: Backups can be exported off the volume
- **WHEN** `make prod-backup-export DEST=./backup-export` runs with the default named volume
- **THEN** `./backup-export` contains every `db-*.dump` and `uploads-*.tar.gz` currently in the volume

#### Scenario: Retention prunes old dumps
- **WHEN** the backups target contains dumps older than `BACKUP_RETENTION_DAYS`
- **THEN** the next successful scheduled backup run deletes them and keeps newer dumps

#### Scenario: One-shot backups never prune
- **WHEN** an imported dump older than `BACKUP_RETENTION_DAYS` is in the backups target and `make prod-backup` (or the safety backup of `make prod-restore`) runs
- **THEN** that dump still exists afterwards

#### Scenario: Interrupted dump leaves no complete-looking file
- **WHEN** the backup container is killed while `pg_dump` is running
- **THEN** no new `db-*.dump` file exists for that run

#### Scenario: Stale backups are visible
- **WHEN** backups have failed for longer than twice `BACKUP_INTERVAL_SECONDS`
- **THEN** `docker compose ps` reports the backup service as `unhealthy`

### Requirement: Uploads are backed up with the database when stored locally
When `STORAGE_DRIVER` is `local`, the `backup` service SHALL also archive the uploads source (the same `${UPLOADS_SOURCE:-uploads}` the api writes, mounted read-only at `/uploads`) to `uploads-<UTC timestamp>.tar.gz` in `/backups` on every run, apply the same temporary-name, `umask 077` and retention rules to those archives, and skip the archive when `BACKUP_UPLOADS=false`.

- GNU tar exit status `1` (files changed while they were archived) SHALL keep the archive when
  `gzip -t` confirms it is intact, and SHALL log a warning. Any other non-zero status, or a failed
  `gzip -t`, SHALL delete the temporary file and fail the run.
- The health check SHALL also turn unhealthy when archives are expected (`STORAGE_DRIVER=local` and
  `BACKUP_UPLOADS` not `false`) and no `uploads-*.tar.gz` newer than twice the interval exists.

The deployment guide SHALL recommend `STORAGE_DRIVER=s3` for production and, in that case, setting
`BACKUP_UPLOADS=false`, because object storage provides its own durability.

#### Scenario: Uploads archive accompanies the dump
- **WHEN** a backup run completes with `STORAGE_DRIVER=local` and default settings
- **THEN** `/backups` contains an `uploads-<timestamp>.tar.gz` whose listing includes the files in the uploads source

#### Scenario: Archive follows a host-folder uploads source
- **WHEN** `UPLOADS_SOURCE=./data/uploads` is set and a backup run completes
- **THEN** the uploads archive lists the files in `./data/uploads`

#### Scenario: Uploads archive can be disabled
- **WHEN** `BACKUP_UPLOADS=false`
- **THEN** backup runs write only database dumps

#### Scenario: A file changing during the run keeps the archive
- **WHEN** a file in the uploads source grows while the backup archives it and tar exits `1`
- **THEN** the run succeeds, `uploads-<timestamp>.tar.gz` exists and the log contains a warning that the uploads changed while archiving

#### Scenario: Missing uploads archives are visible
- **WHEN** `STORAGE_DRIVER=local`, `BACKUP_UPLOADS` is not `false`, and no uploads archive newer than twice `BACKUP_INTERVAL_SECONDS` exists
- **THEN** `docker compose ps` reports the backup service as `unhealthy`

### Requirement: Restore, upgrade and rollback runbook
`compose.production.yml` SHALL define a one-shot `restore` service under the Compose profile `restore` that replaces the database only after the whole dump restored successfully, and the self-hosting deployment guide SHALL document as copy-pasteable commands how to restore with it, how to bring backups from another host into the backups target, how to copy backups off the host, how to upgrade, and how to roll back by pinning an image tag; the restore procedure SHALL be verified by a restore drill before release and by the CI compose smoke test.

- The `restore` service uses the same `postgres` image, runs as root, mounts
  `${UPLOADS_SOURCE:-uploads}` read-write at `/app/uploads` and `${BACKUPS_SOURCE:-backups}`
  read-only at `/backups`, and reads the file names from `RESTORE_DB_DUMP` and
  `RESTORE_UPLOADS_ARCHIVE`. It SHALL accept only names matching
  `^db-[0-9]{8}T[0-9]{6}Z\.dump$` and `^uploads-[0-9]{8}T[0-9]{6}Z\.tar\.gz$`. For a dump it SHALL
  check the archive with `pg_restore --list`, restore it into a new database `<POSTGRES_DB>_restore`
  (dropping a leftover one first) with `pg_restore --no-owner --single-transaction --exit-on-error`,
  and only after that succeeded drop the live database with `dropdb --force` and rename the restored
  database into its place, so a failed restore leaves the live database unchanged. For an archive it
  SHALL extract it into `/app/uploads` and finish with `chown -R 1000:1000 /app/uploads`. Because it
  is in a profile, `make prod-up` never starts it.
- `make prod-restore DUMP=<file> UPLOADS=<file>` SHALL stop `api`, `web` and `backup`, make sure
  `postgres` is healthy, take a safety backup (`BACKUP_ONESHOT=1`, without starting `migrate`),
  stop with a non-zero exit before restoring anything when that backup fails, run the restore
  service with those names (either may be omitted), and start the stack again, which re-runs
  `migrate` so migrations newer than the dump are applied. The same commands work for named volumes
  and host folders.
- Importing backups from another host: `docker compose cp <file> backup:/backups/`.
- Off-host copies: backups on the same disk do not survive a disk failure; the guide SHALL show
  `make prod-backup-export` followed by at least one way to copy the result elsewhere (for example
  `rsync` or `rclone`), and for a host-folder target the direct `rsync` of that folder.
- Upgrade: `make prod-pull` then `make prod-up`; the `migrate` service applies new migrations.
- Rollback: set `IMAGE_TAG` to a previous `<full-sha>` or `vX.Y.Z` and run `make prod-up`; the guide
  SHALL state that database migrations are not rolled back automatically, so rolling back across
  a schema change requires restoring the pre-upgrade dump, and that this compose file runs only
  images that support the `migrate` entrypoint mode (wave 6 and later); an older release needs its
  own `compose.production.yml` from git.

#### Scenario: Restore drill recovers data
- **WHEN** a dump and an uploads archive from one stack are copied into a fresh stack with `docker compose cp` and `make prod-restore DUMP=<dump> UPLOADS=<archive>` runs
- **THEN** the recipe and user counts match the source and previously uploaded photos load

#### Scenario: Restore works with host folders
- **WHEN** `UPLOADS_SOURCE=./data/uploads` and `BACKUPS_SOURCE=./backups` are set and `make prod-restore` runs with a dump and an archive from `./backups`
- **THEN** the photos are extracted into `./data/uploads` owned by `1000:1000` and the api starts healthy

#### Scenario: Restore onto a newer schema replaces the whole database
- **WHEN** the live database has a table that the dump does not contain, with foreign keys to `user` and `recipe`, and `make prod-restore DUMP=<dump>` runs
- **THEN** the target exits `0`, that table no longer exists, every table holds the dump's rows, and `drizzle.__drizzle_migrations` matches the dump before `migrate` runs

#### Scenario: Older dump is upgraded by migrate
- **WHEN** a dump taken before the newest migration is restored with `make prod-restore`
- **THEN** `migrate` exits `0` after applying the missing migrations and the api becomes healthy

#### Scenario: Failed restore leaves the live database unchanged
- **WHEN** `pg_restore` fails part-way through a dump
- **THEN** the restore service exits non-zero, the live database still holds its previous data, no `<POSTGRES_DB>_restore` database is left behind, and api, web and backup stay stopped

#### Scenario: Safety backup precedes every restore
- **WHEN** `make prod-restore` runs
- **THEN** a new `db-*.dump` of the database as it was before the restore exists in the backups target
- **AND** when that backup fails, the target exits non-zero and the restore service never runs

#### Scenario: Unsafe restore names are rejected
- **WHEN** `make prod-restore DUMP=../../etc/passwd` runs
- **THEN** the restore service exits non-zero with a message naming the expected file pattern and changes nothing

#### Scenario: Restore is never started by a normal deploy
- **WHEN** `make prod-up` runs
- **THEN** no `restore` container is created

#### Scenario: Rollback by tag
- **WHEN** an operator sets `IMAGE_TAG=<previous full sha>` in `.env.production` and runs `make prod-up`
- **THEN** both the api and web containers run the images with that tag
