# Coffee Varieties & Equipment

BrewForm ships with an extensive database of coffee varieties, processing methods, specialty
lots, and brewing equipment — all available through the API and linked to recipes.

## Coffee Varieties

The coffee varieties database contains **98 entries** across three categories:

| Category      | Description                                                      | Count |
| ------------- | ---------------------------------------------------------------- | ----- |
| `variety`     | Coffee species and cultivars (Arabica, Robusta, Liberica, etc.)  | 67    |
| `processing`  | Post-harvest processing methods and fermentation styles          | 15    |
| `market_name` | Commercially known names and specialty lots                      | 16    |

### Variety Structure

Each coffee variety record includes:

- **Taxonomy** — `name`, `category`, `species`, `origin`, `spread`
- **Agronomics** — `altitudeRangeM`, `plantSize`, `diseaseResistance`, `yield`, `caffeinePct`
- **Cup Profile** — `cupProfile`, `body`, `acidity`
- **Variety Tree** — `subVarieties`, `regionalVariants`
- **Processing** — `processingCompatibility` (array), specific `processing` and `fermentation` styles
- **Sourcing** — `notableFarms`, `notableRegions`, `priceRange`, `globalSharePct`

### Example Varieties

| Name                | Category      | Species               |
| ------------------- | ------------- | --------------------- |
| Typica              | variety       | *Coffea arabica*      |
| Bourbon             | variety       | *Coffea arabica*      |
| Gesha (Geisha)      | variety       | *Coffea arabica*      |
| Caturra             | variety       | *Coffea arabica*      |
| Ethiopian Heirloom  | variety       | *Coffea arabica*      |
| Natural/Dry Process | processing    | —                     |
| Washed Process      | processing    | —                     |
| Honey Process       | processing    | —                     |
| Anaerobic Fermentation | processing | —                     |

## Equipment Catalog

The equipment catalog contains **378 items** across 8 categories:

| Category                              | Count | Examples                                    |
| ------------------------------------- | ----: | ------------------------------------------- |
| Espresso Machines — Commercial        |   110 | La Marzocco Linea Mini, Profitec Pro 700    |
| Grinders                              |    65 | Mahlkönig EK43, Baratza Encore ESP          |
| Pour-Over & Filter Brewers            |    44 | Hario V60, Chemex, Kalita Wave             |
| Immersion & Pressure Brewers          |    53 | Aeropress, French Press, Moka Pot           |
| Kettles & Water Tools                 |    20 | Fellow Stagg EKG, Hario Buono               |
| Milk Texturing & Frothing Tools       |    12 | Motta Pitcher, Nanofoamer                    |
| Scales, Measurement & Accessories     |    60 | Acaia Lunar, Hario Drip Scale, timemore     |
| Coffee Roasters                       |    14 | Aillio Bullet R1, Huky 500T                 |

### Equipment Structure

Each equipment record includes:

- **Identity** — `name`, `brand`, `model`, `description`
- **Type** — one of 17 equipment types (`espresso_machine`, `grinder`, `pour_over_brewer`,
  `immersion_brewer`, `kettle`, `milk_tool`, `scale_accessory`, `roaster`, `portafilter`,
  `basket`, `puck_screen`, `paper_filter`, `tamper`, `mesh_filter`, `cezve`, `thermometer`,
  `other`)
- **Ownership** — `createdBy` (optional user reference), `isSystem` flag for built-in catalog
  items
- **Timestamps** — `createdAt`, `updatedAt`, `deletedAt` (soft delete)

## How Recipes Link to Coffee Varieties and Equipment

### Recipe → Coffee Variety

Each recipe version can optionally reference a coffee variety via `recipe_versions.coffee_variety_id`.
Additionally, recipe versions carry a free-text `coffee_variety_name` field for cases where a
specific variety isn't in the database.

```text
recipe → recipe_version → coffee_variety
```

### Recipe → Equipment

Recipe versions are linked to equipment through a many-to-many junction table
(`recipe_equipment`). Each recipe can specify multiple pieces of equipment used during brewing.

```text
recipe → recipe_version → recipe_equipment → equipment
```

### Setup → Equipment

User setups (brewing station configurations) also link to equipment, allowing users to specify
their exact gear:

```text
setup → equipment (via portafilter_id, basket_id, puck_screen_id, etc.)
```

### Brew Method Compatibility

The `brew_method_equipment_rule` table defines which equipment types are compatible with which
brew methods (e.g., a `portafilter` is compatible with `espresso_machine` but not with `v60`).
This provides data-driven validation when users select equipment for a recipe.

## Seed Data Files

The canonical seed data lives in static TypeScript files (not parsed from JSON at runtime):

| File | Contents | Source |
|---|---|---|
| `packages/db/src/seed-equipment-catalog.ts` | 378 equipment entries with pre-populated IDs | Generated from `files/coffee_equipments_v2.json` |
| `packages/db/src/seed-coffee-varieties.ts` | 98 coffee variety entries with pre-populated IDs | Generated from `files/coffee_types_v2.json` |
| `packages/db/src/seed-users-recipes.ts` | Users, recipes, vendors, beans, social data, setups | Manually maintained |

All catalog entries have deterministic UUIDs (derived from names) and `isSystem: true`.

## How to Contribute New Coffee Varieties or Equipment

1. **Add an entry** to the appropriate static seed file:
   - `packages/db/src/seed-equipment-catalog.ts` for equipment
   - `packages/db/src/seed-coffee-varieties.ts` for coffee varieties
2. **Generate a deterministic UUID** for the new entry (use the same hashing approach
   as existing entries — namespace + name).
3. **Add the `coffeeVarietyName`** to existing or new recipes in
   `packages/db/src/seed-users-recipes.ts` if they should reference the new entry.
4. **Run the seed** to populate the database:
   ```bash
   make db-seed
   ```

Re-running the seed is idempotent — existing records are skipped via `onConflictDoNothing`.
