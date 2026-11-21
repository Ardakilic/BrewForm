# Agent instructions

See the [guide](docs/guide.md#setup), the [roadmap](plans/ROADMAP.md) and [this section](#rules).

## Rules

- Soft deletes: filter with `isNull(t.deletedAt)`, e.g. `and(eq(t.id, id), isNull(t.deletedAt))`.
- The word "denotes" and the denominator of a ratio are ordinary words.
- External links are not resolved: [Node](https://nodejs.org/) and [mail](mailto:team@example.com).
