## ADDED Requirements

### Requirement: Locale files maintain deterministic bidirectional key parity

The files `packages/shared/src/i18n/en.json` and `packages/shared/src/i18n/tr.json` SHALL expose
identical key sets. The parity test in `packages/shared/src/i18n/i18n.test.ts` SHALL enforce this
deterministically (NOT via sampling):

```typescript
describe('i18n key parity', () => {
  it('en and tr expose identical key sets', () => {
    const enKeys = Object.keys(enJson).sort();
    const trKeys = Object.keys(trJson).sort();
    expect(enKeys).toEqual(trKeys);
  });
});
```

The existing one-directional sampled property test (en→tr, 100 random samples of 504 keys) SHALL be
replaced by (or supplemented with) the deterministic bidirectional equality check. Every value in
both locale files SHALL be a string (no nested objects, no arrays, no nulls).

**Reason:** The existing parity test (`i18n.test.ts`, 22 lines) uses `npm:fast-check` with
`numRuns: 100` sampling 100 random keys of 504 from en→tr only. It could miss an asymmetry on a
given run and doesn't check tr→en. D40 adds ~150+ new keys; a deterministic test guarantees no key
ships half-translated. The current state is exact parity (504=504, verified); this requirement
locks it.

#### Scenario: Deterministic parity test passes

- **WHEN** `make test-shared` is executed (or `deno test --no-check --allow-all packages/shared/src/i18n/i18n.test.ts`)
- **THEN** the deterministic bidirectional key-set equality assertion passes

#### Scenario: Adding an en key without tr fails the test

- **WHEN** a key is added to `en.json` without a corresponding key in `tr.json`
- **THEN** the parity test fails with a diff showing the extra en key

#### Scenario: Every locale value is a string

- **WHEN** the locale files are inspected
- **THEN** every value is of type `string` — no nested objects, no arrays, no nulls (the flat-key
  convention)

### Requirement: Locale files use the flat-key dotted convention

The locale files (`en.json`, `tr.json`) SHALL use the flat-key dotted convention: every key is a
dotted string (e.g. `"admin.users.title"`, `"recipe.create.section.basicInfo"`, `"error.404"`),
and every value is a string. Nested JSON objects (e.g. `{ "admin": { "users": { "title": "..." } } }`)
SHALL NOT be introduced. The `t()` function (`packages/shared/src/i18n/index.ts:10`) takes a single
dotted key string and looks it up in the flat object — it is single-arg (no interpolation support).
For strings requiring interpolation (e.g. "Page {page} of {total}", "Ban User: {name}",
"Logged in as {username}"), the implementer SHALL use JavaScript string concatenation or
`.replace('{placeholder}', value)` on the `t()` result — `t()` itself does NOT accept params.

New keys added by D40 SHALL follow this convention:
- `admin.<page>.<field>` for per-page admin keys (e.g. `admin.users.searchPlaceholder`,
  `admin.equipment.addField`).
- `compare.<field>` for RecipeComparePage (e.g. `compare.brewMethod`, `compare.loading`).
- `verifyEmail.<state>` for VerifyEmailPage (e.g. `verifyEmail.verifying`, `verifyEmail.verified`).
- `legal.privacy.<section>` / `legal.terms.<section>` for legal page headers and notice.
- `recipe.create.section.<name>` / `recipe.create.field.<name>` /
  `recipe.create.placeholder.<name>` / `recipe.create.button.<name>` /
  `recipe.create.error.<name>` for RecipeCreatePage.
- `recipe.edit.section.<name>` / `recipe.edit.field.<name>` / etc. for RecipeEditPage.
- `error.boundary.<field>` for ErrorBoundary generic fallback.

**Reason:** The locale files are already flat-keyed (504 keys, all string values, dotted paths).
The D40 plan's "establish key namespaces" language refers to dotted-key prefixes, NOT nested JSON
objects. This requirement codifies the convention so a fresh-context implementer doesn't introduce
nested objects.

#### Scenario: No nested objects in locale files

- **WHEN** `en.json` and `tr.json` are parsed and their values are inspected
- **THEN** every value is a string — no value is a plain object or array

#### Scenario: New keys follow dotted convention

- **WHEN** the new D40 keys are inspected in `en.json`
- **THEN** they are flat dotted strings (e.g. `"admin.users.title": "User Management"`, NOT
  `{ "admin": { "users": { "title": "User Management" } } }`)

### Requirement: Admin pages use t() for all user-visible strings

All 15 admin pages in `apps/web/src/pages/admin/` SHALL import `useTranslation` from
`../contexts/I18nContext.tsx` (or `../../contexts/I18nContext.tsx` as appropriate) and SHALL replace
every user-visible hardcoded English string with a `t('...')` call. This includes:
- Page titles and headings (`Admin Panel`, `User Management`, `Equipment Management`, etc.).
- Table headers (`Username`, `Email`, `Role`, `Status`, `Actions`, `Name`, `Type`, etc.).
- Field labels (`Email *`, `Username *`, `Password *`, `Display Name`, `Bio`, etc.).
- Button labels (`Save`, `Cancel`, `Delete`, `Edit`, `Search`, `Create User`, `Ban User`, etc.).
- Status badges (`Admin`, `User`, `Banned`, `Active`).
- Loading and empty states (`Loading...`, `No users found.`, `No badges found.`, etc.).
- Confirm dialog text (`Delete this user?`, `Are you sure...`, `Confirm Delete`, etc.).
- Error messages (`Failed to load users.`, `Failed to ban user.`, etc.).
- Pagination labels (`Previous`, `Next`, `Page {page} of {total}` — interpolation via string
  replacement if `t()` doesn't support params, or via a simple template).

The `AdminLayout.tsx` nav labels (`Dashboard`, `Users`, `Recipes`, `Equipment`, `Coffee Varieties`,
`Vendors`, `Taste Notes`, `Compatibility`, `Badges`, `Audit Log`, `Cache`, `Admin Panel`,
`← Back to Site`, `Logged in as {username}`) SHALL use the existing `admin.*` nav keys
(`admin.dashboard`, `admin.users`, `admin.recipes`, `admin.equipment`, `admin.vendors`,
`admin.tasteNotes`, `admin.compatibility`, `admin.badges`, `admin.auditLog`, `admin.flushCache`)
which already exist in both locales but are currently unused.

Shared vocabulary (`Save`, `Cancel`, `Delete`, `Edit`, `Search`, `Loading...`, `Previous`, `Next`,
`Yes`, `No`, `Confirm`, `Back`) SHALL reuse the existing `common.*` keys (`common.save`,
`common.cancel`, `common.delete`, `common.edit`, `common.search`, `common.loading`,
`common.previous`, `common.next`, `common.yes`, `common.no`, `common.confirm`, `common.back`). A
parallel `admin.common.*` namespace SHALL NOT be created.

**Reason:** All 15 admin pages have zero `t()` calls despite the i18n infrastructure being in
place. The `admin.*` nav namespace (24 keys) and `common.*` vocabulary already exist but are
unused. D40 wires existing keys and adds the missing per-page CRUD keys. Reusing `common.*` avoids
duplicating Save/Cancel/Delete/etc. into `admin.common.*` (see design Decision 5).

#### Scenario: No admin page has zero t() calls

- **WHEN** `grep -rL "useTranslation\|I18nContext" apps/web/src/pages/admin/` is run
- **THEN** no `.tsx` file is returned — every admin page imports `useTranslation`

#### Scenario: AdminLayout uses existing admin.* nav keys

- **WHEN** the source of `AdminLayout.tsx` is inspected
- **THEN** the nav labels use `t('admin.dashboard')`, `t('admin.users')`, `t('admin.recipes')`,
  etc. (the existing keys), NOT hardcoded English strings

#### Scenario: Admin pages reuse common.* vocabulary

- **WHEN** the source of the admin pages is inspected for Save/Cancel/Delete/Edit/Search buttons
- **THEN** they use `t('common.save')`, `t('common.cancel')`, `t('common.delete')`, etc. — NOT
  new `admin.common.*` keys and NOT hardcoded English

#### Scenario: Grep gate per admin page

- **WHEN** a grep for user-visible English string literals (capitalised words in JSX outside
  `t()` calls) is run on each admin page
- **THEN** no user-visible literals remain outside `t()` calls (aria-labels and alt text included)

### Requirement: User-facing pages use t() for all user-visible strings

The following 5 pages SHALL import `useTranslation` and replace every user-visible hardcoded
English string with a `t('...')` call:

- `apps/web/src/pages/recipes/RecipeComparePage.tsx` — full conversion. Title uses the existing
  `recipe.compareTitle` key; row labels (Brew Method, Drink Type, Dose, Yield, Time, Temperature,
  Ratio, Rating, Taste Notes, Equipment) use new `compare.*` keys; loading/error strings use
  `compare.loading`, `compare.notFound`.
- `apps/web/src/pages/auth/VerifyEmailPage.tsx` — full conversion. New `verifyEmail.*` keys
  (verifying, verified, failed, goHome). The log-message drift at line 41
  (`'token verification failed'` vs the `web-page-logging` spec's `'verifyEmail failed'`) SHALL be
  fixed while touching the file.
- `apps/web/src/pages/PrivacyPage.tsx` — translate the page title (`legal.privacy.title`), "Last
  updated" label (`legal.lastUpdated`), and 6 section headers (`legal.privacy.section1`...
  `section6`). The legal body paragraphs SHALL remain in English. A translated notice
  (`legal.notice`) SHALL be added at the top: "This document is currently available in English
  only." (en) / "Bu belge şu anda yalnızca İngilizce olarak mevcuttur." (tr). See design Decision 7.
- `apps/web/src/pages/TermsPage.tsx` — same pattern as PrivacyPage with `legal.terms.*` keys.
- `apps/web/src/pages/NotFoundPage.tsx` — **no-op if D37 has landed** (the consolidated
  `ErrorPage.tsx` `NotFoundPage` already uses `t('error.404')` + `t('common.goHome')`). If D37 is
  deferred, convert the routed `NotFoundPage.tsx` in place using `error.404` + `common.goHome`.

`PrivacyPage.tsx` and `TermsPage.tsx` SHALL also add mount/unmount `log.debug` logs (they currently
lack them — a pre-existing `web-page-logging` gap).

**Reason:** These 5 pages have zero `t()` calls. A Turkish-locale user hits English on the compare
view, email verification, legal pages, and 404s. The legal-pages decision (keep English body with
translated headers + notice) is documented in design Decision 7 — machine-drafting legal Turkish is
a liability risk.

#### Scenario: RecipeComparePage uses t() for all strings

- **WHEN** the source of `RecipeComparePage.tsx` is inspected
- **THEN** every user-visible string is a `t('compare.*')` or `t('recipe.compareTitle')` call —
  no hardcoded English literals

#### Scenario: VerifyEmailPage log message aligns with web-page-logging spec

- **WHEN** the source of `VerifyEmailPage.tsx` is inspected at the catch block (line ~41)
- **THEN** the `log.error` message is `'VerifyEmailPage verifyEmail failed'` (matching the
  `web-page-logging` spec), NOT `'token verification failed'`

#### Scenario: PrivacyPage translates headers but keeps English body

- **WHEN** `PrivacyPage.tsx` is rendered under the tr locale
- **THEN** the page title, "Last updated" label, and 6 section headers are in Turkish, a translated
  notice ("Bu belge şu anda yalnızca İngilizce olarak mevcuttur.") appears at the top, and the
  legal body paragraphs remain in English

#### Scenario: PrivacyPage and TermsPage have mount/unmount logs

- **WHEN** the source of `PrivacyPage.tsx` and `TermsPage.tsx` is inspected
- **THEN** each has a `useEffect(() => { log.debug({}, '<PageName> mounted'); return () =>
  log.debug({}, '<PageName> unmounted'); }, [])` per the `web-page-logging` spec

### Requirement: RecipeCreatePage and RecipeEditPage complete i18n conversion

RecipeCreatePage and RecipeEditPage MUST complete their i18n conversion (both pages currently have
only 2 `t()` calls — TDS field only). Every remaining user-visible hardcoded English string SHALL
be replaced with a `t('...')` call.

This includes:
- Section titles (passed as the `title` prop to the shared `Section` component —
  `t('recipe.create.section.basicInfo')`, etc.).
- Field labels (passed as the `label` prop to the shared `Field` component —
  `t('recipe.create.field.title')`, etc.).
- Placeholders (`t('recipe.create.placeholder.dose')`, etc.).
- Button labels (`t('recipe.create.button.create')`, `t('common.cancel')`).
- Error/toast messages (`t('recipe.create.error.failed')`, etc.).
- Visibility dropdown options — the `visibility.*` keys (`visibility.draft`,
  `visibility.private`, `visibility.unlisted`, `visibility.public`) already exist in both
  `en.json` and `tr.json` (at lines 238–241) and SHALL be reused directly. No new visibility keys
  are needed.

**Label normalization:** `RecipeCreatePage` uses `Dose (grams)` / `Extraction Time (seconds)` /
`Yield (ml)` while `RecipeEditPage` uses `Dose (g)` / `Extraction Time (s)` / `Yield (ml)`. These
divergent labels SHALL be normalized to shared keys: `recipe.field.dose`, `recipe.field.extractionTime`,
`recipe.field.yield` (used by both pages). The unit suffix can be part of the key value (e.g.
`recipe.field.dose` = "Dose (g)") or split into a separate key — the implementer chooses, but both
pages SHALL use the same key(s).

**Reason:** Both pages are partially converted (2 `t()` calls each for the TDS field) but ~30
strings each remain hardcoded. The shared `Section`/`Field` components (extracted by D36) accept
already-translated strings as props, so the converted pages pass `t()` results as the `title`/`label`
props. The divergent labels are drift that should be normalized during conversion.

#### Scenario: RecipeCreatePage has no hardcoded user-visible literals

- **WHEN** a grep for user-visible English string literals in `RecipeCreatePage.tsx` is run
- **THEN** no literals remain outside `t()` calls (section titles, field labels, placeholders,
  button labels, error messages all use `t()`)

#### Scenario: RecipeEditPage has no hardcoded user-visible literals

- **WHEN** a grep for user-visible English string literals in `RecipeEditPage.tsx` is run
- **THEN** no literals remain outside `t()` calls

#### Scenario: Divergent labels are normalized

- **WHEN** the `t()` calls for the Dose field are inspected in both `RecipeCreatePage.tsx` and
  `RecipeEditPage.tsx`
- **THEN** both use the same key (e.g. `t('recipe.field.dose')`) — NOT different keys for "Dose
  (grams)" vs "Dose (g)"

### Requirement: Per-page tr-locale spot-check tests

Each converted page MUST have a component test that renders it under the tr locale and asserts at
least one known Turkish string appears (spot-check, not exhaustive). This applies to all 22
converted pages (15 admin + 5 user-facing + 2 partial recipe pages). The test pattern:

```typescript
const trT = (k: string) => trJson[k] ?? k;
mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });
render(<PageUnderTest />);
expect(screen.getByText(trJson['<some.key>'])).toBeInTheDocument();
```

Tests SHALL follow the existing pattern used by `RecipeListPage.test.tsx`, `HomePage.test.tsx`,
`EquipmentCatalogPage.test.tsx`, `SettingsPage.test.tsx` (all of which mock `useTranslation` with a
`trT` function and assert Turkish text appears).

For pages that already have tests (e.g. `AdminEquipmentPage.test.tsx`, `AdminTasteNotesPage.test.tsx`,
`HomePage.test.tsx`), extend them with a tr-locale case. For pages without tests, add a minimal
spot-check test.

**Reason:** The grep gate catches missed literals; the tr-locale spot-check verifies the keys
actually resolve to Turkish text at runtime. Together they give high confidence the conversion is
complete. The pattern is mature in the codebase (~30 existing tests use it).

#### Scenario: Each converted page has a tr-locale spot-check test

- **WHEN** the test files for the 22 converted pages are inspected
- **THEN** each has at least one test case that renders under the tr locale (via mocked
  `useTranslation` returning `trT`) and asserts a known Turkish string appears

#### Scenario: tr-locale spot-check tests pass

- **WHEN** `make test-web` is executed
- **THEN** all per-page tr-locale spot-check tests pass

### Requirement: Converted pages preserve mount/unmount logging and cache invariants

Every converted page SHALL preserve its existing `log.debug({}, '<PageName> mounted')` and
`log.debug({}, '<PageName> unmounted')` lifecycle logs per the `web-page-logging` spec. The i18n
conversion touches string literals, not the `useEffect` logging hooks — the two concerns are
orthogonal.

Pages that call `invalidateStaticCache()` on successful mutations (`AdminEquipmentPage`,
`AdminTasteNotesPage`) SHALL preserve those calls per the `static-cache` spec. The i18n conversion
SHALL NOT remove or reorder cache invalidation logic.

Pre-existing empty `catch` blocks in some admin pages (`AdminAuditLogPage.tsx:38`,
`AdminCoffeeVarietiesPage.tsx:205,220`, `AdminCompatibilityPage.tsx:31,41,49`,
`AdminRecipesPage.tsx:44,53`, `AdminVendorsPage.tsx:33,58,68`) are pre-existing
`web-page-logging` violations and are **out of scope** for D40 — they SHALL NOT be fixed during
i18n conversion (see design Decision 8). The one exception is `VerifyEmailPage.tsx:41`'s log-message
drift, which is fixed while touching the file.

**Reason:** i18n conversion is string-level; logging and cache logic are structural. Mixing them
expands scope. The empty catches are tracked by `web-page-logging` and can be addressed in a
dedicated pass. The `VerifyEmailPage` log-message fix is a one-line change in a file already being
converted.

#### Scenario: Converted pages retain mount/unmount logs

- **WHEN** the source of each converted page is inspected
- **THEN** the `useEffect(() => { log.debug({}, '<PageName> mounted'); ... }, [])` block is
  present and unchanged from the pre-conversion state

#### Scenario: AdminEquipmentPage and AdminTasteNotesPage retain invalidateStaticCache calls

- **WHEN** the source of `AdminEquipmentPage.tsx` and `AdminTasteNotesPage.tsx` is inspected
- **THEN** the `invalidateStaticCache()` calls on successful mutations are present and unchanged

#### Scenario: Pre-existing empty catches are not fixed by D40

- **WHEN** the source of the admin pages with known empty catches is inspected
- **THEN** the empty `catch {}` blocks remain (they are out of scope — documented in design
  Decision 8) — EXCEPT `VerifyEmailPage.tsx`'s log-message drift which is fixed

### Requirement: I18nContext logging and locale-switch behaviour preserved

The `I18nContext` provider (`apps/web/src/contexts/I18nContext.tsx`) SHALL be unchanged by D40 —
the provider/hook implementation stays; D40 only adds keys and converts pages. The locale-change
debug log (`log.debug({ locale }, 'I18nContext locale changed')` per the `web-context-hook-logging`
spec) SHALL be preserved. The guarantee that logger errors SHALL NOT prevent locale switches (per
`web-context-hook-logging` spec) SHALL be preserved.

**Reason:** D40 adds keys and converts pages; it does NOT restructure the i18n infrastructure.
The `web-context-hook-logging` spec contracts on `I18nContext` must remain satisfied.

#### Scenario: I18nContext locale-change log preserved

- **WHEN** the source of `I18nContext.tsx` is inspected
- **THEN** the `log.debug({ locale }, 'I18nContext locale changed')` call on locale switch is
  present and unchanged

#### Scenario: I18nContext implementation unchanged

- **WHEN** `git diff` for `I18nContext.tsx` is inspected
- **THEN** no functional changes are present (D40 does not touch the provider/hook implementation)