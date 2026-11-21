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
| Gesha / Geisha      | variety       | *Coffea arabica*      |
| Caturra             | variety       | *Coffea arabica*      |
| Ethiopian Heirloom / Landrace | variety | *Coffea arabica*  |
| Natural (Dry) Process | processing  | —                     |
| Washed (Wet) Process | processing   | —                     |
| Yellow Honey Process | processing   | —                     |
| Anaerobic Natural   | processing    | —                     |

## Equipment Catalog

The equipment catalog contains **378 items** across 8 categories:

| Category (source file)                | `type`             | Count | Examples                                     |
| ------------------------------------- | ------------------ | ----: | -------------------------------------------- |
| Espresso Machines — Commercial        | `espresso_machine` |   110 | La Marzocco Linea Mini, Profitec Pro 600     |
| Grinders                              | `grinder`          |    65 | Mahlkönig EK43 / EK43 S, Baratza Encore ESP  |
| Pour-Over & Filter Brewers            | `pour_over_brewer` |    44 | Hario V60 02 Ceramic, Chemex, Kalita Wave    |
| Immersion & Pressure Brewers          | `immersion_brewer` |    53 | AeroPress, Espro P3 French Press, Bialetti Moka Express |
| Kettles & Water Tools                 | `kettle`           |    20 | Fellow Stagg EKG, Hario V60 Buono            |
| Milk Texturing & Frothing Tools       | `milk_tool`        |    12 | Fellow Opus Milk Pitcher, Subminimal NanoFoamer |
| Scales, Measurement & Accessories     | `scale_accessory`  |    60 | Acaia Lunar, Felicita Arc, Timemore Black Mirror |
| Coffee Roasters                       | `roaster`          |    14 | Aillio Bullet R1 V2, Ikawa Pro V3            |

The remaining nine equipment types (`portafilter`, `basket`, `puck_screen`, `paper_filter`,
`tamper`, `mesh_filter`, `cezve`, `thermometer`, `other`) have no catalog entries; users add such
items themselves.

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

Each recipe version can optionally reference a coffee variety via `recipe_versions.coffee_variety_id`
(`coffeeVarietyId` in the API). The version also stores `coffee_variety_name`, a copy of the
variety's name that the API resolves server-side when the variety is set; clients never send
`coffeeVarietyName`, and clearing `coffeeVarietyId` clears it. The copy keeps the name readable
on old versions, forks and diffs.

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
setup → equipment (via portafilter_id, basket_id, puck_screen_id, paper_filter_id, tamper_id)
```

### Brew Method Compatibility

The `brew_method_equipment_rule` table defines which equipment types are compatible with which
brew methods (e.g., a `portafilter` is compatible with `espresso_machine` but not with `v60`).
Recipe create and edit reject incompatible equipment with `422 VALIDATION_ERROR`, and admins
toggle rules on the admin compatibility page.

## Seed Data Files

The canonical seed data lives in static TypeScript files (not parsed from JSON at runtime):

| File | Contents | Source |
|---|---|---|
| `packages/db/src/seed-equipment-catalog.ts` | 378 equipment entries with pre-populated IDs | Generated from `files/coffee_equipments_v2.json` |
| `packages/db/src/seed-coffee-varieties.ts` | 98 coffee variety entries with pre-populated IDs | Generated from `files/coffee_types_v2.json` |
| `packages/db/src/seed-users-recipes.ts` | Users, recipes, vendors, beans, social data, setups, brew-method/equipment rules | Manually maintained |

All catalog entries have deterministic UUIDs (UUID v5 derived from names) and `isSystem: true`.
`packages/db/src/seed.ts` inserts them (plus the taste-note wheel from `files/scaa-2.json`).

## How to Contribute New Coffee Varieties or Equipment

1. **Add an entry** to the appropriate static seed file:
   - `packages/db/src/seed-equipment-catalog.ts` for equipment
   - `packages/db/src/seed-coffee-varieties.ts` for coffee varieties
2. **Generate a deterministic UUID** for the new entry (use the same hashing approach
   as existing entries — namespace + name).
3. **Add the `coffeeVarietyName`** to existing or new recipes in
   `packages/db/src/seed-users-recipes.ts` if they should reference the new entry (the seed
   looks the variety up by that exact name and sets `coffeeVarietyId`).
4. **Run the seed** to populate the database:
   ```bash
   make db-seed
   ```

Re-running the seed is idempotent — existing records are skipped via `onConflictDoNothing`.
