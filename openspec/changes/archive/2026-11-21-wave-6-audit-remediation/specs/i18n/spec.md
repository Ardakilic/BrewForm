## MODIFIED Requirements

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

**Reason:** The existing parity test (`i18n.test.ts`, 22 lines) uses `fast-check` with
`numRuns: 100` sampling 100 random keys of 504 from en→tr only. It could miss an asymmetry on a
given run and doesn't check tr→en. D40 adds ~150+ new keys; a deterministic test guarantees no key
ships half-translated. The current state is exact parity (504=504, verified); this requirement
locks it.

#### Scenario: Deterministic parity test passes

- **WHEN** `make test-shared` is executed (or `pnpm --filter @brewform/shared exec vitest run src/i18n/i18n.test.ts`)
- **THEN** the deterministic bidirectional key-set equality assertion passes

#### Scenario: Adding an en key without tr fails the test

- **WHEN** a key is added to `en.json` without a corresponding key in `tr.json`
- **THEN** the parity test fails with a diff showing the extra en key

#### Scenario: Every locale value is a string

- **WHEN** the locale files are inspected
- **THEN** every value is of type `string` — no nested objects, no arrays, no nulls (the flat-key
  convention)
