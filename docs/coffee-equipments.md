# Coffee Equipment

BrewForm ships with a comprehensive equipment catalog of **378 items** across **8 categories**.
Each entry has a pre-populated deterministic UUID and is seeded as `isSystem: true`.

## Categories

| Category | Count | Examples |
|---|---|---|
| Espresso Machines — Commercial | 110 | La Marzocco Linea Mini, Profitec Pro 700, Decent DE1Pro |
| Grinders | 65 | Mahlkonig EK43, Niche Zero, Baratza Encore ESP |
| Pour-Over & Filter Brewers | 44 | Hario V60, Chemex, Kalita Wave |
| Immersion & Pressure Brewers | 53 | Aeropress, French Press, Moka Pot |
| Kettles & Water Tools | 20 | Fellow Stagg EKG, Hario Buono |
| Milk Texturing & Frothing Tools | 12 | Motta Pitcher, Nanofoamer |
| Scales, Measurement & Accessories | 60 | Acaia Lunar, Hario Drip Scale |
| Coffee Roasters | 14 | Aillio Bullet R1, Huky 500T |

## Equipment Types

Equipment is categorized into 17 types in the `equipment_type` enum:

**Broad categories (8):** `espresso_machine`, `grinder`, `pour_over_brewer`, `immersion_brewer`, `kettle`, `milk_tool`, `scale_accessory`, `roaster`

**Accessories (9):** `portafilter`, `basket`, `puck_screen`, `paper_filter`, `tamper`, `mesh_filter`, `cezve`, `thermometer`, `other`

## Seed Data

Equipment catalog entries are stored in `packages/db/src/seed-equipment-catalog.ts` with pre-populated deterministic UUIDs. Each entry includes:

- `id` — Deterministic UUID (derived from name)
- `name` — Brand + model (e.g., "La Marzocco Linea Mini")
- `type` — One of 17 equipment types
- `brand` — Manufacturer
- `model` — Model name
- `description` — Notable features
- `isSystem: true` — Marked as system/catalog entry

## Recipe Linkage

Recipes link to equipment via the `recipe_equipment` junction table:

```
recipe → recipe_version → recipe_equipment → equipment
```

## Brew Method Compatibility

The `brew_method_equipment_rule` table defines which equipment types are compatible with each brew method. See `packages/shared/src/constants/brew-method-rules.ts` for the complete ruleset (55+ rules).

## User Equipment

Users can also add their own equipment. User-created equipment has:
- `isSystem: false`
- `createdBy` set to the user's ID

Users cannot delete system equipment directly — they must submit a delete request for admin review.

## Contributing

To add new equipment:
1. Add an entry to `packages/db/src/seed-equipment-catalog.ts`
2. Generate a deterministic UUID (use the same hashing approach as existing entries)
3. Run `make db-seed` to populate the database
