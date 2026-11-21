# unique-identifiers Specification

## Purpose

Defines identifier uniqueness for accounts and their records. Emails are normalized before
validation, storage and lookup, email and username uniqueness and lookups are case-insensitive at
the database level, identifiers of soft-deleted accounts stay reserved with conflicts mapped to 409,
and reserved usernames are refused at self-registration. It also allows one active default setup per
user, lets join rows be re-created after removal, and requires existing conflicts to be found and
remediated before stricter constraints apply.

## Requirements
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
- Lowercasing is safe because Zod's default email pattern accepts only ASCII, where JavaScript
  `toLowerCase()` and Postgres `lower()` agree.
- `packages/db/src/seed.ts` SHALL apply the same `trim().toLowerCase()` to `ADMIN_EMAIL` before
  inserting or selecting the admin user.

#### Scenario: Registration stores a normalized email

- **WHEN** a user registers with email `  Mixed.Case@Example.COM `
- **THEN** the response is `201` and the stored `user.email` is `mixed.case@example.com`

#### Scenario: Schema normalization is unit-tested

- **WHEN** `AuthLoginSchema.parse({ email: ' A@B.CO ', password: 'x' })` and `EmailSchema.safeParse('not-an-email')` run
- **THEN** the first returns `email === 'a@b.co'` and the second fails

### Requirement: Email and username uniqueness is case-insensitive at the database level

The system SHALL enforce case-insensitive uniqueness of `user.email` and `user.username` with expression unique indexes declared in `packages/db/src/schema.ts`: `uniqueIndex('user_email_lower_unique').on(lower(table.email))` and `uniqueIndex('user_username_lower_unique').on(lower(table.username))`.

- `lower(column: AnyPgColumn): SQL` SHALL be exported from `packages/db/src/schema.ts` as
  `` sql`lower(${column})` ``, with a `// D03 raw-SQL exception:` comment that says Drizzle has no
  `lower()` builder. Models import it from `@brewform/db/schema`. Services never import it.
- The existing exact constraints `user_email_unique` and `user_username_unique` SHALL be kept, so
  the seed's `onConflictDoNothing({ target: users.email })` keeps a matching constraint and the
  existing constraint names stay valid.
- The migration SHALL be produced only by `make db-generate` from `schema.ts` (no hand-written
  SQL). It creates both indexes inside Drizzle's single migration transaction, so if existing data
  violates an index, the whole migration rolls back and the database is unchanged (see the
  identifier-check requirement).
- Usernames keep the letter case the user chose. Only uniqueness and lookups ignore case.
- `citext` and other extensions SHALL NOT be used.

#### Scenario: Case variants cannot both exist

- **WHEN** two `user` rows are inserted directly through Drizzle with emails `Case<m>@example.com` and `case<m>@example.com`
- **THEN** the second insert fails with SQLSTATE `23505` on constraint `user_email_lower_unique`
- **AND** the same holds for usernames `Arda<m>` and `arda<m>` on `user_username_lower_unique`

#### Scenario: Generated migration matches the schema

- **WHEN** `make db-generate` runs after the schema change, the migration is applied with `make db-migrate`, and `make db-generate` runs again
- **THEN** the generated SQL contains `CREATE UNIQUE INDEX "user_email_lower_unique" ON "user" USING btree (lower("email"))` and the username equivalent
- **AND** the second run prints `No schema changes, nothing to migrate`

### Requirement: Email and username lookups are case-insensitive

The system SHALL compare emails and usernames with `eq(lower(<column>), value.toLowerCase())` (or `inArray(lower(<column>), values.map(toLowerCase))`) in every identifier lookup, so the comparison matches the expression unique indexes and is served by them.

The lookups this requirement covers:

- `auth/model.ts`: `findUserByEmail` (login, forgot password), `findUserByUsername`,
  `isEmailTaken` and `isUsernameTaken`;
- `admin/model.ts`: `isEmailTaken` and `isUsernameTaken`;
- `user/model.ts`: `findByUsername` (`GET /api/v1/users/:username`);
- `notification/model.ts`: `findMentionTargets` (comment mentions).

Related changes:

- `parseMentions` in `packages/shared/src/utils/mention.ts` SHALL de-duplicate usernames
  case-insensitively, keeping the first spelling seen, so `@Arda @arda` uses one of the
  `MAX_MENTIONS` slots.
- `UserProfilePage` (`apps/web/src/pages/users/UserProfilePage.tsx`) SHALL decide "this is my
  profile" by comparing the viewer's `id` with the loaded `profile.id` (for `isSelf` and in the
  loader's brews-tab check), not by comparing usernames with the URL parameter.
- Rows written before this change may hold mixed-case emails. Lookups through `lower()` find them,
  so no backfill is required.

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

### Requirement: Identifiers of soft-deleted accounts stay reserved and conflicts map to 409

The system SHALL treat the email and username of a soft-deleted account as taken. The availability checks `isEmailTaken` and `isUsernameTaken` (auth and admin models) SHALL NOT filter `deletedAt`, so that they agree with the global unique indexes, and registration and admin writes SHALL answer a taken identifier with `409` and the existing messages instead of relying on a failed insert.

- This is a deliberate exception to the soft-delete filtering rule. Each function's docblock, and
  the `auth/model.ts` module docblock (which says every user query filters soft-deletes), SHALL
  state the exception and the reason: the unique indexes cover soft-deleted rows, and keeping a
  deleted account's username reserved stops a new account from inheriting its old profile links and
  mentions.
- A `23505` from the user insert or update is only a race fallback. It SHALL map to
  `EMAIL_ALREADY_EXISTS` for `user_email_unique` or `user_email_lower_unique`, and to
  `USERNAME_ALREADY_EXISTS` for `user_username_unique` or `user_username_lower_unique`, through
  `isUniqueViolation`. The constraint names SHALL be exported as `USER_EMAIL_CONSTRAINTS` and
  `USER_USERNAME_CONSTRAINTS` from `apps/api/src/modules/auth/model.ts` and reused by
  `admin/model.ts#throwIfUniqueViolation`.
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

### Requirement: Reserved usernames are refused at self-registration

The system SHALL refuse self-registration of a reserved username as if it were taken, using `RESERVED_USERNAMES` and `isReservedUsername(username)` exported from `packages/shared/src/utils/username.ts`.

- `RESERVED_USERNAMES` SHALL contain exactly: `admin`, `administrator`, `root`, `system`,
  `support`, `help`, `api`, `brewform`, `moderator`, `staff`, `official`, `security`, `anonymous`,
  `deleted`, `null`, `undefined`, `settings`.
- `isReservedUsername` SHALL compare case-insensitively and SHALL also return `true` for any
  username starting with `deleted-`, which is kept free for operator tombstones.
- `register` in `apps/api/src/modules/auth/service.ts` SHALL throw `USERNAME_ALREADY_EXISTS`
  (`409 Username already taken`) for a reserved username, so the response does not reveal the list.
- Admin-created users, the seed (whose default admin username is `admin`) and existing accounts
  SHALL NOT be affected.

#### Scenario: Reserved names are refused in any case

- **WHEN** users try to register `Support`, `ADMIN` and `deleted-abc123`
- **THEN** each response is `409` with `Username already taken`

#### Scenario: Admins can still create a reserved name

- **WHEN** an admin creates a user with username `brewform` through `POST /api/v1/admin/users`
- **THEN** the response is `201`

### Requirement: A user has at most one active default setup

The system SHALL guarantee that each user has at most one setup with `is_default = true` among their non-deleted setups. A partial unique index ``uniqueIndex('setup_user_default_unique').on(table.userId).where(sql`${table.isDefault} = true and ${table.deletedAt} is null`)`` in `packages/db/src/schema.ts` enforces this, and the default switch runs in a single transaction.

- `createSetup`, `updateSetup` (with `isDefault: true`) and `setDefault` in
  `apps/api/src/modules/setup/service.ts` SHALL stop calling `clearDefaultForUser` before a
  separate write. Instead, `model.create(data)` and `model.update(id, data, ownerId)` SHALL, when
  `data.isDefault === true`, clear the owner's other active default and write the target row inside
  one `db.transaction`. `clearDefaultForUser` SHALL be removed once unused.
- A race that still trips the index surfaces as `409 CONFLICT` through the global error handler,
  never as two defaults or a `500`.
- Soft-deleting the default setup leaves the user with no default, as today.

#### Scenario: Database refuses a second active default

- **WHEN** two active setups with `is_default = true` are inserted directly for one user
- **THEN** the second insert fails with `23505` on `setup_user_default_unique`
- **AND** a soft-deleted default setup plus one active default setup for the same user insert successfully

#### Scenario: Concurrent default switches leave exactly one default

- **WHEN** a user calls `setDefault` on two different setups concurrently through `Promise.all`
- **THEN** each call either succeeds or fails with `409 CONFLICT`, and afterwards exactly one of the user's active setups has `is_default = true`

### Requirement: Join rows can be re-created after removal

The system SHALL keep composite-unique join rows re-creatable after a user removes them. Likes, favourites, ratings, follows, collection items and awarded badges are hard-deleted on removal (or upserted), so re-adding never hits their unique constraint. `user_recipe_note`, the only soft-deleted composite-unique table, revives its row through `onConflictDoUpdate` that clears `deleted_at`. A future soft-deleted join table SHALL use the same revive-on-conflict upsert.

#### Scenario: Re-adding after removal succeeds

- **WHEN** a user likes, unlikes and likes a recipe again; favourites, unfavourites and favourites it again; follows, unfollows and follows a user again; and adds, removes and re-adds a recipe to a collection
- **THEN** every final request succeeds and exactly one join row exists for each pair

### Requirement: Identifier conflicts are detected and remediated before stricter constraints apply

The system SHALL ship an operator script, `packages/db/src/check-identifiers.ts`, that reports existing data violating the stricter constraints of this change and offers opt-in, transactional fixes. It SHALL be guarded by `if (import.meta.main)`, run under `node` (as `check-users-empty.ts` does), and be exposed as `make db-check-identifiers`.

- Pure, unit-tested functions SHALL do the grouping over plain row arrays:
  `groupCaseInsensitiveDuplicates(rows, key)` for `email` and `username`, and
  `findMultipleDefaults(rows)` for setups. The script loads only `id`, `email`, `username`,
  `deletedAt` and `createdAt` from `user`, `id`, `userId` and `updatedAt` from active default
  setups, and `id` from recipes whose slug is `''`.
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

- **WHEN** `groupCaseInsensitiveDuplicates` receives rows with emails `A@x.io` (active), `a@x.io` (soft-deleted) and `b@x.io`, and the report formatter renders the result
- **THEN** one group with both ids is returned, its soft-deleted member is marked fixable, and the rendered report contains neither `a@x.io` nor `A@x.io`

#### Scenario: Multiple defaults are found and fixed

- **WHEN** `findMultipleDefaults` receives two active default setups for one user with different `updatedAt`
- **THEN** it returns that user with the older setup id listed for clearing

