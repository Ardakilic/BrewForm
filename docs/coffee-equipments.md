# Coffee Equipment

BrewForm ships with a comprehensive equipment catalog of **378 items** across **8 categories**.
Each entry has a pre-populated deterministic UUID and is seeded as `isSystem: true`.

## Categories

| Category (`type`) | Count | Examples |
|---|---|---|
| Espresso Machines — Commercial (`espresso_machine`) | 110 | La Marzocco Linea Mini, Profitec Pro 600, Decent Espresso DE1Pro |
| Grinders (`grinder`) | 65 | Mahlkönig EK43 / EK43 S, Niche Zero, Baratza Encore ESP |
| Pour-Over & Filter Brewers (`pour_over_brewer`) | 44 | Hario V60 02 Ceramic, Chemex, Kalita Wave |
| Immersion & Pressure Brewers (`immersion_brewer`) | 53 | AeroPress, Espro P3 French Press, Bialetti Moka Express |
| Kettles & Water Tools (`kettle`) | 20 | Fellow Stagg EKG, Hario V60 Buono |
| Milk Texturing & Frothing Tools (`milk_tool`) | 12 | Fellow Opus Milk Pitcher, Subminimal NanoFoamer |
| Scales, Measurement & Accessories (`scale_accessory`) | 60 | Acaia Lunar, Felicita Arc |
| Coffee Roasters (`roaster`) | 14 | Aillio Bullet R1 V2, Ikawa Pro V3 |

The catalog is generated from `files/coffee_equipments_v2.json`.

## Equipment Types

Equipment is categorized into 17 types in the `equipment_type` enum:

**Broad categories (8):** `espresso_machine`, `grinder`, `pour_over_brewer`, `immersion_brewer`, `kettle`, `milk_tool`, `scale_accessory`, `roaster`

**Accessories (9):** `portafilter`, `basket`, `puck_screen`, `paper_filter`, `tamper`, `mesh_filter`, `cezve`, `thermometer`, `other`

The catalog only uses the 8 broad categories; the accessory types are for user-added equipment
and setups (portafilter, basket, puck screen, paper filter and tamper slots).

## Seed Data

Equipment catalog entries are stored in `packages/db/src/seed-equipment-catalog.ts` with pre-populated deterministic UUIDs. Each entry includes:

- `id` — Deterministic UUID (UUID v5 derived from the name)
- `name` — Brand + model (e.g., "La Marzocco Linea Mini")
- `type` — One of 17 equipment types
- `brand` — Manufacturer
- `model` — Model name
- `description` — Notable features
- `isSystem: true` — Marked as system/catalog entry

## Recipe Linkage

Recipes link to equipment via the `recipe_equipment` junction table:

```text
recipe → recipe_version → recipe_equipment → equipment
```

## Brew Method Compatibility

The `brew_method_equipment_rule` table defines which equipment types are compatible with each brew method. The seed fills it from `brewMethodCompatibilityRules` in `packages/db/src/seed-users-recipes.ts` (53 rules); after that the table is the source of truth, and admins toggle rules on the admin compatibility page (`/admin/compatibility`). Recipe create and edit check the selected equipment against the table and reject incompatible items with `422 VALIDATION_ERROR`. A type with no rule for the brew method is allowed.

`BREW_METHOD_EQUIPMENT_RULES` in `packages/shared/src/constants/brew-method-rules.ts` (44 rules) is an older copy of the matrix; neither the API nor the seed reads it.

## User Equipment

Users can also add their own equipment. User-created equipment has:
- `isSystem: false`
- `createdBy` set to the user's ID

Only the creator can edit or delete their own equipment (`PATCH`/`DELETE /api/v1/equipment/:id`). For any other item, system entries included, users submit a delete request (`POST /api/v1/equipment/:id/delete-request`) that admins review under `/api/v1/admin/equipment/delete-requests`. Admins can also create, edit and delete any equipment through `/api/v1/admin/equipment`.

## Contributing

To add new equipment:
1. Add an entry to `packages/db/src/seed-equipment-catalog.ts`
2. Generate a deterministic UUID (use the same hashing approach as existing entries)
3. Run `make db-seed` to populate the database
