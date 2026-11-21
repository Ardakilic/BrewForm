## ADDED Requirements

### Requirement: Taste picker, session banner and version badge strings are translated

`TasteAutocomplete`, `TasteNotesFilter`, `SessionRestoreBanner` and `MetadataBadges` SHALL render every user-visible string through `t()` with en and tr values.

- `TasteAutocomplete`: loading (`taste.autocomplete.loading`), empty (`taste.notFound`), hint
  (`taste.autocomplete.intensityHint`), flavour-wheel link (`taste.reference`) and the intensity
  button `title` (`a11y.taste.intensityTitle`, `{level}` filled with `.replace`).
- `TasteNotesFilter`: empty state (`taste.notFound`).
- `SessionRestoreBanner`: `session.restore.networkError`, `session.restore.serverError`,
  `common.retry`, `common.retrying`, `common.dismiss`.
- `MetadataBadges`: `recipe.priorVersions.one` / `recipe.priorVersions.other` (`{count}`).
- The admin user detail avatar `alt` uses `a11y.userAvatar`.

#### Scenario: Taste picker under the tr locale

- **WHEN** the recipe form renders `TasteAutocomplete` with locale `tr`, one selected note at intensity 2, and the user searches for a term with no match
- **THEN** the hint, the flavour-wheel link, the empty message and the intensity button's `title` show the tr values, and no English text from the picker remains

#### Scenario: Session banner under the tr locale

- **WHEN** session restore fails with a network error and the locale is `tr`
- **THEN** the banner shows the tr network message and tr Retry and Dismiss buttons

## MODIFIED Requirements

### Requirement: A literal-attribute regression test guards against new stragglers

A regression test (`apps/web/src/i18n-literals.test.ts`) SHALL walk `apps/web/src/**/*.tsx` (excluding `*.test.*`) and SHALL fail on every `placeholder`, `aria-label`, `alt` or `title` attribute whose value carries untranslated text, in every quoting form, outside an explicit in-test allowlist.

The test SHALL scan whole file contents, so an attribute value that Biome wraps onto the next line
is still checked, and SHALL flag:

- a quoted string value in either quote style (`title="Enter name"`, `title='Enter name'`; Biome
  writes JSX attributes in double quotes) that contains two consecutive letters;
- a string-literal expression value (`title={'Enter name'}`, `title={"Enter name"}`) that contains
  two consecutive letters;
- a template-literal value whose static text, after removing every `${…}` interpolation,
  contains two consecutive letters. A template made only of interpolations and punctuation
  (`` `${data.title} – ${t('recipe.versionHistory')}` ``) passes; a `t()` call inside a template
  does not exempt its static text.

Letters are matched with the Unicode property `\p{L}`. The test SHALL also check its own matcher
against inline fixtures (each flagged form, a wrapped template, an allowlisted value and an
interpolation-only template), so a broken pattern cannot silently match nothing. The allowlist
documents the deliberate exceptions:

- Locale-neutral input examples, kept untranslated by policy (D40): `you@example.com` (register,
  login and forgot-password pages) and `coffee_lover` (register page).
- Format tokens such as `YYYY-MM-DD`.
- Brand names and other locale-invariant values.

**Reason:** D99.7 recurred because nothing gates literal attributes: D40's conversion held for
visible JSX text, but placeholders, aria labels and SEO strings regressed within one wave. The
parity test guards key symmetry; this test guards key _usage_. The first version matched only
single-quoted values and only template `aria-label`s, so it never matched a Biome-formatted
attribute and missed the taste picker's intensity `title` and the admin avatar `alt`.

#### Scenario: Regression test passes on the converted tree

- **WHEN** the web test suite runs
- **THEN** the literal-attribute test passes: every non-allowlisted attribute value routes
  through `t()`

#### Scenario: A new literal fails CI

- **WHEN** a developer adds `placeholder="Enter name"` (or `placeholder='Enter name'`) to a component without a `t()` call
- **THEN** the regression test fails, naming the file, line and attribute

#### Scenario: A template-literal title fails CI

- **WHEN** a developer adds `` title={`Intensity ${level}/3`} ``, on one line or wrapped onto the next
- **THEN** the regression test fails, naming the file and the attribute's line

#### Scenario: An interpolation-only template passes

- **WHEN** a component renders `` title={`${data.title} – ${t('recipe.versionHistory')}`} ``
- **THEN** the regression test does not flag it
