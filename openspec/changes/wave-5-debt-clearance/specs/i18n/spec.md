## ADDED Requirements

### Requirement: Straggler hardcoded literals are translated

Every remaining hardcoded user-visible English literal in `apps/web/src` SHALL be replaced with a
`t('...')` call, with en+tr key pairs added in the same commit (the deterministic parity test in
`packages/shared/src/i18n/i18n.test.ts` fails CI on any asymmetry). The verified straggler set
(2026-07-19 re-audit, every ledger citation re-confirmed at its line):

- **Placeholders** (follow the existing `*.placeholder` convention, en.json:94/477):
  `RegisterPage.tsx:171` ('Coffee Lover'), `:186` ('At least 8 characters'), `:247` ('Re-enter your
  password'); `LoginPage.tsx:91`; `ResetPasswordPage.tsx:114,131`; `BeanListPage.tsx:138,153,168`;
  `SetupListPage.tsx:107,122,137`; `EquipmentListPage.tsx:143`;
  `components/recipe/TasteNotesFilter.tsx:192`; `components/taste/TasteAutocomplete.tsx:293`.
- **Three fully untranslated components** (each imports `useTranslation`):
  `components/EmailVerificationBanner.tsx:33,40` (banner text, 'Email sent!', 'Sending...', 'Resend
  verification email'); `components/photos/PhotoUpload.tsx:65,69,91,113,116,131` (validation errors
  with `{name}`-style interpolation per the en.json:436 precedent, drop-zone copy, 'Uploading...');
  `components/qrcode/RecipeQRCode.tsx:45,51` ('Downloading...', 'Download QR Code',
  `alt='Recipe QR Code'`).
- **Pluralization:** `components/recipe/StarRating.tsx:105-107` — 'No community votes yet' and the
  hardcoded `${count} community ${count === 1 ? 'vote' : 'votes'}` become two keys (e.g.
  `recipe.rating.noVotes`, `recipe.rating.voteCount` with `{count}`; tr pluralization differs from
  en).
- **Error fallbacks:** `ResetPasswordPage.tsx:40,50`; `ForgotPasswordPage.tsx:36`;
  `RegisterPage.tsx:71` ('Registration failed'). While in the files, fix `LoginPage.tsx:39`, which
  falls back to `t('auth.login.title')` — a page title — as the login-failed text.
- **Misc:** `components/recipe/EquipmentSection.tsx:86` fallback 'Main Brewer';
  `components/ErrorBoundary.tsx:33` 'An unexpected error occurred.' (verify provider nesting first —
  ErrorBoundary may render outside `I18nProvider`; if so, use a locale-aware fallback instead of
  `t()`); `RegisterPage.tsx:81` visible 'Loading...' (reuse `common.loading`).

**Reason:** D99.7 confirmed open and larger than the ledger records: every cited literal still
exists and a fresh sweep found ~25 additional files (three fully untranslated components, English
pluralization, error fallbacks). A tr-locale user hits raw English across auth, photos, QR, and
rating surfaces despite D40's "complete i18n" claim.

#### Scenario: Straggler files render Turkish

- **WHEN** `EmailVerificationBanner`, `PhotoUpload`, `RecipeQRCode`, and `StarRating` render under
  the tr locale
- **THEN** all user-visible strings (banner text, drop-zone copy, download labels, vote counts)
  appear in Turkish via `t()` — no hardcoded English remains

#### Scenario: Parity test stays green

- **WHEN** `make test-shared` runs after the new keys land
- **THEN** the deterministic bidirectional en/tr key-parity assertion passes — every new key exists
  in both locale files

#### Scenario: LoginPage error fallback uses an error key

- **WHEN** a login attempt fails without a server-provided message
- **THEN** the fallback text comes from a dedicated error key — not `t('auth.login.title')`

### Requirement: Accessibility and SEO strings are translated

All user-visible `aria-label`, `alt`, SEO `title`, and SEO `description` strings SHALL go through
`t()`, using the existing `a11y.*` namespace (precedent: en.json:435-436, including the `{name}`
interpolation idiom) or the owning page's namespace:

- **Literal aria-labels:** `RecipeDetailPage.tsx:279` + `RecipeFocusModePage.tsx:166` ('Preparation
  notes'); `CoffeeVarietyDetailPage.tsx:128` + `EquipmentDetailPage.tsx:97` +
  `components/recipe/BreadcrumbNav.tsx:32` ('Breadcrumb' — one key, shared by the consolidated
  Breadcrumb component); `pages/recipes/useCoffeeVarietyFilter.tsx:172` ('Clear variety filter');
  `components/recipe/ScaaRadarChart.tsx:117`; `components/recipe/BeanSection.tsx:131,154`;
  `components/recipe/ShareSection.tsx:68,84,97,108,118,138,158` (brand names Twitter/X/Facebook/
  WhatsApp/Reddit stay as interpolated values); `components/recipe/TastingNotesSection.tsx:101`; the
  12 equipment icon components at `components/icons/equipment/*Icon.tsx:19` (icon components accept
  a translated label prop or call `useTranslation` — 'Other Equipment', 'Paper Filter', 'Mesh
  Filter', 'Scale', 'Thermometer', 'Gooseneck Kettle', 'Puck Screen', 'Basket', 'Tamper',
  'Portafilter', etc.).
- **Template-string aria-labels with English scaffolding** (convert to `t()` +
  `.replace('{x}', value)` interpolation): `TasteNotesPage.tsx:169`;
  `TasteAutocomplete.tsx:257,274`; `components/recipe-list/ActiveFilterBadge.tsx:30`;
  `TastingNotesSection.tsx:142`; `components/recipe-list/RecipeListView.tsx:281`;
  `components/recipe/BrewTimeline.tsx:132`; `components/recipe/IntensityDots.tsx:15` ('Intensity {n}
  of 3').
- **SEO strings** (SEOHead already accepts arbitrary strings — pass `t()` at call sites):
  `HomePage.tsx:53` `title='Home'`; `RecipeNotAvailablePage.tsx:14` `title='Recipe Not Available'`;
  `TasteNotesPage.tsx:239` `description='Explore the SCAA flavor
  wheel taste notes on BrewForm.'`.

**Reason:** Screen-reader users and search snippets get English regardless of locale — ~20 literal
aria-labels, 8 template-string labels with English scaffolding, and 3 SEO strings survived D40
because its grep gate focused on visible JSX text.

#### Scenario: No literal English a11y attributes remain

- **WHEN** `apps/web/src/**/*.tsx` (excluding tests) is scanned for `aria-label='...'`/`alt='...'`
  string literals
- **THEN** zero English literals remain outside the documented allowlist — all route through `t()`
  (verified by the literal-attribute regression test below)

#### Scenario: Template aria-labels interpolate translated scaffolding

- **WHEN** `IntensityDots` renders intensity 2 under the tr locale
- **THEN** its `aria-label` is the Turkish key value with `{intensity}`-style values substituted —
  no English words in the template

#### Scenario: SEO strings localize

- **WHEN** `HomePage` renders under the tr locale
- **THEN** the SEOHead title is the Turkish `t()` value, and the parity test covering the new keys
  passes

### Requirement: Shared-component chrome strings are translated

The shared components' remaining hardcoded English SHALL move to `t()` keys with en+tr pairs:

- `components/recipe/BreadcrumbNav.tsx:45` — the untranslated 'Recipes' segment label.
- `components/recipe/BreadcrumbNav.tsx:9-17,68` — the brew-method segment labels sourced from
  `BREW_METHODS` constants (map through the existing brew-method i18n keys).
- `components/recipe-list/RecipeCard.tsx:28` — the hardcoded English `'by '` author prefix (the
  RecipeCard extension in the web-shared-components delta consumes this key; EquipmentDetailPage
  already demonstrates the pattern with `t('recipe.focusMode.by')`).

**Reason:** These two components render on every recipe surface; a tr-locale user sees English
'Recipes' and 'by' on each card and breadcrumb — the highest-visibility stragglers in the set.

#### Scenario: RecipeCard author prefix is translated

- **WHEN** `RecipeCard` renders with an author under the tr locale
- **THEN** the author line uses the Turkish value of the 'by' key —
  `grep -n '"by "'
  apps/web/src/components/recipe-list/RecipeCard.tsx` returns zero hits

#### Scenario: Breadcrumb segments are translated

- **WHEN** the recipe breadcrumb renders under the tr locale
- **THEN** the 'Recipes' segment and the brew-method segment render Turkish labels

### Requirement: Delete confirmations use dedicated deleteConfirm keys

Confirm-dialog text SHALL come from dedicated i18n keys — never from concatenating `t(key) + '?'`.
The three concat sites SHALL adopt dedicated keys matching the admin pattern (cf.
`AdminVendorsPage.tsx:61` `t('admin.vendors.deleteConfirm')`): `SetupListPage.tsx:58` →
`setup.deleteConfirm`, `BeanListPage.tsx:61` → `bean.deleteConfirm`, `EquipmentListPage.tsx:71` →
`equipment.deleteConfirm`. Because these sites migrate to the `useConfirm()` primitive (see the
web-shared-components delta), the keys are passed as `titleKey`/`bodyKey` — the primitive takes
keys, not prebuilt strings, so the concat anti-pattern cannot recur.

**Reason:** `t('common.delete') + '?'` produces grammatically wrong sentences in tr (suffix
morphology) and splits the confirm UX from the admin pages' proper deleteConfirm keys.

#### Scenario: No t()+'?' concatenation remains

- **WHEN** `grep -rn "+ '?'" apps/web/src` is run
- **THEN** zero hits on confirm text — the three list pages pass dedicated `deleteConfirm` keys to
  `useConfirm()`

#### Scenario: Confirm text is grammatical in Turkish

- **WHEN** the bean delete confirm renders under the tr locale
- **THEN** the dialog shows the full `bean.deleteConfirm` tr value (a complete sentence), and the
  key exists in both en.json and tr.json

### Requirement: Dates and numbers follow the active locale

User-visible dates and decimal numbers SHALL render in the active app locale (the `I18nContext`
locale, not the browser locale), via the shared locale-aware formatter defined in the
web-shared-components delta. This covers the 8 bare `toLocaleDateString()` sites
(`RecipeVersionsPage.tsx:93`, `AdminUserDetailPage.tsx:209,217`, `AdminUsersPage.tsx:190`,
`AdminAuditLogPage.tsx:100`, `NotificationItem.tsx:101`, `CommentSection.tsx:305,395`),
`BeanSection.tsx:33-34`'s raw-ISO `formatDateISO`, and the unlocalized decimal points at
`StarRating.tsx:74` / `utils/stat-cards.ts:98` (tr renders comma decimals). Switching the in-app
language selector SHALL re-render dates and numbers in the new locale.

**Reason:** i18n was declared complete in D40, but every date except the legal pages' ignores the
app locale, and the same recipe page mixes ISO and browser-locale formats. Locale-correct formatting
is an i18n guarantee, not just a styling one.

#### Scenario: Language switch re-formats dates

- **WHEN** a user switches the app language from en to tr on a page showing comment dates
- **THEN** the dates re-render in tr format without a reload — driven by the context locale

#### Scenario: Decimals localize

- **WHEN** `StarRating` shows an average of 4.5 under the tr locale
- **THEN** the value renders with the tr decimal separator ("4,5")

### Requirement: A literal-attribute regression test guards against new stragglers

A regression test (e.g. `apps/web/src/i18n-literals.test.ts`) SHALL walk `apps/web/src/**/*.tsx`
(excluding `*.test.*`) and assert zero string-literal `placeholder='[A-Za-z]...'`,
`aria-label='[A-Za-z]...'`, `alt='[A-Za-z]...'`, and `title='[A-Za-z]...'` attributes outside an
explicit in-test allowlist. Template-string aria-label attributes (backtick-interpolated) with
alphabetic scaffolding SHALL be a second assertion. The allowlist documents the deliberate
exceptions:

- Locale-neutral input examples, kept untranslated by policy (D40's deliberate call, now written
  down): 'you@example.com' (`RegisterPage.tsx:138`, `LoginPage.tsx:73`,
  `ForgotPasswordPage.tsx:87`), 'coffee_lover' (`RegisterPage.tsx:154`).
- Format tokens: 'YYYY-MM-DD' (`SettingsPage.tsx:289`).
- Brand names and other locale-invariant values.

**Reason:** D99.7 recurred because nothing gates literal attributes — D40's conversion held for
visible JSX text but placeholders/aria/SEO regressed within one wave. The parity test guards key
symmetry; this test guards key _usage_.

#### Scenario: Regression test passes on the converted tree

- **WHEN** the web test suite runs after the T5 conversion
- **THEN** the literal-attribute test passes — every non-allowlisted attribute literal routes
  through `t()`

#### Scenario: A new literal fails CI

- **WHEN** a developer adds `placeholder='Enter name'` to a component without a `t()` call
- **THEN** the regression test fails, naming the file and attribute
