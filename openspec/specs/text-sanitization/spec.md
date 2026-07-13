# text-sanitization Specification

## Purpose
TBD - created by archiving change wave-1-correctness-security. Update Purpose after archive.
## Requirements

### Requirement: sanitizeText has dedicated unit-test coverage

The API package SHALL contain a test file `apps/api/src/utils/sanitize.test.ts` that exercises the `sanitizeText` export from `./sanitize.ts` with both dangerous-input and benign-input cases. The test SHALL follow the pure-utility convention established by `apps/api/src/utils/response/response.test.ts` — no `test-setup.ts` import, no Hono app, no spies, no `{ sanitizeOps, sanitizeResources }` options. Tests SHALL be organised into a `describe('sanitizeText', () => { ... })` block with `it('should ...', () => { ... })` cases.

`sanitizeText` is a security control (regex-based stripping used by `comment`, `recipe`, and `user` services). A regression — a tag or attribute slipping through — would ship silently without this suite.

The test SHALL cover at minimum:

**Dangerous-input neutralisation:**
- Script tags: `<script>alert(1)</script>` → stripped to `alert(1)` (the tags are removed; the inner text may remain — assert the exact output).
- Script tags with attributes: `<script src="x.js"></script>` → stripped.
- Closing tags: `</script>` → stripped.
- Image tags with event handlers: `<img src=x onerror=alert(1)>` → stripped (the whole tag matches `/<\/?[a-z][^>]*>/gi`).
- Anchor tags with event-handler attributes: `<a href="x" onclick="alert(1)">link</a>` → the tag is stripped, `link` text remains.
- Zero-width Unicode characters: U+200B (ZWSP), U+200C (ZWNJ), U+200D (ZWJ), U+FEFF (BOM), U+00AD (soft hyphen) → removed.
- Whitespace abuse: runs of spaces/tabs collapsed to a single space; 3+ consecutive newlines collapsed to 2; leading/trailing whitespace trimmed.

**Benign-input pass-through (regression baseline):**
- Plain text: `hello world` → `hello world` (unchanged).
- Numeric comparisons: `1 < 2 > 1` → `1 < 2 > 1` (unchanged — the regex's `[a-z]` anchor after `<` prevents matching `<` followed by a space or digit; this is the intentional design documented in the `stripHtmlTags` JSDoc at `sanitize.ts:10`).
- Markdown bold/italic: `**bold** _italic_` → unchanged (the sanitizer does not process markdown).
- Newlines preserved for markdown: `line1\nline2` → `line1\nline2` (single newlines are preserved by `normalizeWhitespace`).

**Documented limitations (asserted as pass-through to lock the regression baseline):**
- `javascript:` URLs as bare text: `javascript:alert(1)` → `javascript:alert(1)` (unchanged — the sanitizer does not filter URL schemes; this is a documented limitation, not a bug to fix in this change).
- HTML entity-encoded attacks: `&#60;script&#62;` → `&#60;script&#62;` (unchanged — the sanitizer does not decode entities; documented limitation).
- `<` not followed by a letter: `< script>` → `< script>` (unchanged — the regex requires a letter after `<` to avoid matching `1 < 2`; documented limitation).

**Nullish input:**
- `null` → `''` (empty string).
- `undefined` → `''`.
- `''` → `''`.

#### Scenario: Script tag is stripped

- **WHEN** `sanitizeText('<script>alert(1)</script>')` is called
- **THEN** the result does not contain `<script` or `</script`
- **AND** the `alert(1)` inner text is preserved (the tags are removed, the content between them is not)

#### Scenario: Image tag with onerror is stripped

- **WHEN** `sanitizeText('<img src=x onerror=alert(1)>')` is called
- **THEN** the result is `''` (the entire tag is removed; there is no inner text)

#### Scenario: Numeric comparison is preserved

- **WHEN** `sanitizeText('1 < 2 > 1')` is called
- **THEN** the result is `'1 < 2 > 1'` (unchanged — the `<` is followed by a space, not a letter, so `stripHtmlTags` does not match)

#### Scenario: Zero-width characters are removed

- **WHEN** `sanitizeText('hello\u200Bworld')` is called (with a zero-width space between `hello` and `world`)
- **THEN** the result is `'helloworld'` (the zero-width character is removed)

#### Scenario: javascript: URL passes through unchanged (documented limitation)

- **WHEN** `sanitizeText('javascript:alert(1)')` is called
- **THEN** the result is `'javascript:alert(1)'` (unchanged — this is the documented limitation; the test locks it as a regression baseline)

#### Scenario: HTML entity passes through unchanged (documented limitation)

- **WHEN** `sanitizeText('&#60;script&#62;')` is called
- **THEN** the result is `'&#60;script&#62;'` (unchanged — the sanitizer does not decode entities; documented limitation)

#### Scenario: Nullish input returns empty string

- **WHEN** `sanitizeText(null)` is called
- **THEN** the result is `''`
- **AND** the same holds for `undefined` and `''`

### Requirement: sanitizeName has dedicated unit-test coverage

The same test file `apps/api/src/utils/sanitize.test.ts` SHALL contain a `describe('sanitizeName', () => { ... })` block exercising the `sanitizeName` export. `sanitizeName` applies `sanitizeText` and then collapses all newlines to spaces (names must be single-line). Test cases SHALL cover:

- Newline collapse: `John\nDoe` → `John Doe` (newlines replaced with spaces, then whitespace runs collapsed).
- Whitespace collapse: `John   Doe` → `John Doe` (2+ spaces collapsed to 1).
- HTML stripping inherited from `sanitizeText`: `<script>John</script>` → `John`.
- Nullish input: `null` → `''`.
- Leading/trailing trim: `  John  ` → `John`.

#### Scenario: Newlines are collapsed to single spaces

- **WHEN** `sanitizeName('John\nDoe')` is called
- **THEN** the result is `'John Doe'` (no newlines, single space separator)

#### Scenario: HTML tags are stripped (inherited from sanitizeText)

- **WHEN** `sanitizeName('<script>John</script>')` is called
- **THEN** the result is `'John'`

#### Scenario: Nullish input returns empty string

- **WHEN** `sanitizeName(null)` is called
- **THEN** the result is `''`

### Requirement: sanitize test file follows pure-utility conventions

The test file `apps/api/src/utils/sanitize.test.ts` SHALL:
- Import `describe, it` from `jsr:@std/testing/bdd` and `expect` from `jsr:@std/expect`.
- Import `sanitizeText, sanitizeName` from `./sanitize.ts`.
- NOT import `../../test-setup.ts` (the sanitizer is a pure function with no DB/cache/spy needs).
- NOT use `{ sanitizeOps: false, sanitizeResources: false }` (those options are only for DB I/O tests).
- NOT spin up a Hono app.
- Use nested `describe` blocks per function and `'should ...'` `it` naming, matching `apps/api/src/utils/response/response.test.ts`.

#### Scenario: sanitize test file has no test-setup import

- **WHEN** the source of `apps/api/src/utils/sanitize.test.ts` is inspected
- **THEN** it does NOT contain `import '../../test-setup.ts'`

#### Scenario: All sanitize tests pass

- **WHEN** `make test-specific filter=apps/api/src/utils/sanitize.test.ts` is executed
- **THEN** all `describe('sanitizeText', ...)` and `describe('sanitizeName', ...)` test cases pass

#### Scenario: Type-check and lint pass

- **WHEN** `make check-api` and `make lint` are invoked
- **THEN** zero errors and zero warnings are reported on `apps/api/src/utils/sanitize.test.ts`