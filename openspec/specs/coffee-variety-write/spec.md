# coffee-variety-write Specification

## Purpose

Bounds and validation of the coffee-variety create and update payloads shared by the user and admin routes.

## Requirements
### Requirement: Coffee-variety list fields are bounded
The coffee-variety create and update schemas SHALL accept at most 20 items in each list field (`processingCompatibility`, `subVarieties`, `notableFarms`, `notableRegions`, `regionalVariants`), each a trimmed, non-empty string of at most 100 characters, and SHALL reject a longer list or item with 400 `VALIDATION_ERROR` before any write.

The limits are the exported constants `COFFEE_VARIETY_LIST_MAX_ITEMS` and
`COFFEE_VARIETY_LIST_ITEM_MAX_LENGTH` in `packages/shared/src/schemas/coffee-variety.ts`. They apply
to `POST`/`PATCH /api/v1/coffee-varieties` and `POST`/`PATCH /api/v1/admin/coffee-varieties`, which
validate with the same schemas. The columns stay `text[]`; the seed catalogue uses at most 7 items
of at most 30 characters.

#### Scenario: Oversized item is rejected
- **WHEN** a verified user posts a custom variety whose `notableFarms` holds a 101-character string
- **THEN** the response is 400 `VALIDATION_ERROR` with a `notableFarms` detail and no row is created

#### Scenario: Too many items are rejected
- **WHEN** an admin updates a variety with 21 `processingCompatibility` items
- **THEN** the response is 400 `VALIDATION_ERROR` and the stored variety is unchanged

#### Scenario: Seed-shaped lists are accepted
- **WHEN** a payload carries `notableRegions` with 7 items of at most 30 characters
- **THEN** it validates, and items are stored trimmed

