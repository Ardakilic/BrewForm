# BrewForm — Coffee Dive-In App

A web application for digitalizing, sharing, and discovering coffee brewing recipes and tasting notes.

---

## 1. Concept

BrewForm lets coffee enthusiasts record detailed brewing recipes ("dive-ins"), attach structured tasting notes from the SCAA flavor wheel, and share them with the community. Users can version, fork, compare, follow each other, earn achievement badges, and discuss recipes — building a collaborative coffee knowledge base.

---

## 2. Drink Brewing Dive-In Properties

Each recipe ("dive-in") captures the following:

### 2.1 Coffee Identity

- **Product Name** — brand, region, roast profile, or vendor's custom coffee name.
- **Coffee Brand / Name** — the commercial name of the coffee.
- **Optional Coffee Properties** — washed, naturally extracted, pre/post-processing details, etc.
- **Vendor Information** — vendor's coffee brand or shop.

### 2.2 Date Tracking

- **Roast Date**
- **Package Opening Date**
- **Grind Date** — must not be earlier than roast date (hard validation).
- **Brewing Date**

All dates stored as `date` type, day as minimal interval, selected via datepicker.

### 2.3 Brew Configuration

- **Brew Type / Category** — Espresso, Americano, Latte, Cortado, V60, etc. These act as recipe categories.
- **Drink Type Generated** — Espresso, Americano, Flat White, Latte, Turkish Coffee, etc.
- **Brewing Method** — dropdown: espresso machine, V60, drip coffee, Turkish coffee, etc. Method must be compatible with drink type (e.g. an espresso cannot use a Turkish coffee cezve — hard validation). See §3.15 Brew Method Compatibility Matrix.
- **Brewer Details** — name of the machine.
- **Grinder** — e.g. Lelit Fred, Baratza Encore, etc.
- **Grind Size** — the adjustment setting of the grinder.
- **Ground Weight** — grams or ounces, with automatic metric/imperial conversion at the UI layer.

### 2.4 Equipment

Each equipment type is stored in a dedicated DB table/collection. A brew can reference multiple pieces of equipment.

- **Portafilter Type** — e.g. Bottomless portafilter.
- **Portafilter Basket** — e.g. IMS H24.
- **Puck Screen** — optional; name and details.
- **Paper Filter** — optional; name and details.
- **Tamper** — details.

### 2.5 Yield Details

- **Extraction Time** — in seconds.
- **Extraction Volume** — in milliliters or fluid ounces (UI conversion only).

### 2.6 Extraction Temperature

Optional. Stored in Celsius; UI converts to Fahrenheit if preferred.

### 2.7 Additional Preparation Details

Freeform list of additional materials, each with:

- **Name** — e.g. "Milk"
- **Type** — e.g. whole, oat, almond
- **Input Amount**
- **Preparation Type** — e.g. Steam, Boil, etc.

### 2.8 Personal Tasting Notes

- **Rich text feedback** — personal notes in a rich textarea.
- **Favourite Flag** — personal favourite toggle.
- **10-Star Rating System**
- **Emoji Quick Tags:**
  - 🔥 Amazing
  - 🚀 Super Good
  - 👍 Good
  - 😐 Okay
  - 👎 Bad
  - 🤢 Horrible

### 2.9 Photo Attachments

- Users can upload **one or more photos** per recipe (e.g. the brew, latte art, the beans, the setup).
- Photos are stored on the server filesystem or an object storage backend.
- Photos are displayed in a gallery/carousel on the recipe detail page.
- Photos should be **resized and optimized** on upload (thumbnail + full size).
- Supported formats: JPEG, PNG, WebP.
- A reasonable file size limit per photo (e.g. 10 MB).
- Photos are **versioned with the recipe** — each recipe revision snapshot includes its photo references.
- Photos are soft-deleted when a recipe is soft-deleted.
- Public recipes show photos publicly; private/draft recipes keep photos private.

### 2.10 SCAA Taste Notes (Flavor Wheel Taxonomy)

Structured tasting notes based on the **SCAA 2016 Flavor Wheel**.

#### Data Source

Import from: `https://notbadcoffee.com/flavor-wheel/scaa-2.json`

Download and store the JSON file in a project directory called `files/`.

#### Hierarchy

The taste wheel has a 3-level depth hierarchy (parent → child → grandchild), stored with `parent_id` references in a dedicated `tastes` table.

Example:
```
Fruity > Berry > Raspberry
Fruity > Berry > Blackberry
Fruity > Citrus Fruit > Grapefruit
Sweet > Brown Sugar > Honey
Spices > Brown Spice > Cinnamon
```

#### Selection Rules

- A user can select **any level** of the hierarchy (parent, mid, or leaf).
- A user can select **multiple taste notes** across different parent categories (e.g. both "Fruity > Berry > Raspberry" and "Sweet > Brown Sugar > Honey").
- Taste notes can be attached/detached during recipe creation, editing, and forking.
- Store selections in a **pivot table** (recipe ↔ taste note, many-to-many).

#### UI: Autocomplete

- Use BaseUI Autocomplete component (reference: `https://base-ui.com/react/components/autocomplete`).
- Activate autocomplete after **3 or more characters** typed.
- After typing stops, **wait 2 seconds** (debounce), cancelling any previous search on each keypress.
- Search is **case-insensitive** and matches against the full breadcrumb path.
- If a match hits a parent, **show all its children** in the results.

**Example:** User types `"fruit"` → results:
```
Fruity
Fruity > Berry
Fruity > Berry > Raspberry
Fruity > Berry > Blackberry
Fruity > Berry > Strawberry
Fruity > Citrus Fruit
Fruity > Citrus Fruit > Grapefruit
```

**Example:** User types `"brown"` → results:
```
Spices > Brown Spice
Spices > Brown Spice > Clove
Spices > Brown Spice > Cinnamon
Spices > Brown Spice > Nutmeg
Roasted > Burnt > Brown, Roast
```

It should work like any blog category hierarchy taxonomy system on a news article site. The UI for attaching and detaching taste notes should be easy to understand and not complicated.

#### Caching

- Taste notes rarely change. On first fetch, cache the full taxonomy in **Deno KV** with a long TTL.
- Serve cached data to the client for autocomplete.
- If any taste is added, modified, or deleted (admin panel), **flush the cached taste notes** from Deno KV.

#### SCAA Reference Link

In the recipe creation page, next to the taste notes section, include a link to `https://notbadcoffee.com/flavor-wheel-en/` that opens in a new tab (`target="_blank"`).

#### Admin Panel

- Create a placeholder CRUD section for taste notes in the admin panel, consistent with other resources.
- Add a note: "If any taste is changed, cached taste notes will be flushed."

#### Migration

- Create a Prisma migration to populate all SCAA taste notes with correct parent-child hierarchy, matching the pattern of other seed data migrations.

---

## 3. Core Features

### 3.1 User Setups (Auto-Fill)

- Users define a **"Setup"** — a saved collection of their accessories (machine, grinder, portafilter, basket, etc.).
- A setup is the sum of accessories the user has.
- When creating a dive-in, selecting a setup auto-fills the equipment fields.

### 3.2 My Equipment & My Beans

- **My Equipment** — users add and manage their equipment inventory.
- **My Beans** — users track the beans they currently have.

### 3.3 Autocomplete for Common Fields

- Fields like grinder, machine name, etc. offer autocomplete from existing DB entries.
- If a totally new value is entered, it creates a new equipment record in the database.

### 3.4 Social Features

- **Likes / Favourites** — other users can like/favourite public recipes. Stored in a pivot table (`user_recipe_favourites`) with timestamp.
- **Comments** — users can comment on other people's recipes. **Only the recipe author can reply** to comments. If the commenter is the recipe author, show an **"OP" badge** next to their profile information.
- **Sharing** — recipes can be shared via special URLs. Users can "feature" recipes on their profile page.

### 3.5 Follow Users

- Users can **follow** other brewers.
- A user's profile displays their **follower count** and **following count**.
- Following creates a **personalized feed** where users see new public recipes, forks, and activity from the people they follow.
- Follow/unfollow is a toggle action, stored in a pivot table (`user_follows`) with timestamp.
- Users can view their followers list and following list.
- Follow activity can trigger **optional email notifications** (e.g. "A brewer you follow posted a new recipe").
- Privacy: following is one-directional. Following someone does not grant access to their private/draft recipes.

### 3.6 Recipe Versioning & Edit History

- Each recipe has a **version number**.
- Updating a recipe gives the option to **bump the revision**, creating a new immutable snapshot.
- A recipe version **cannot be edited once created** (immutability — hard validation).
- Full edit history is browsable.

### 3.7 Forking / Remixing

- Users can **fork/remix** any public recipe.
- The fork links back to the original with **attribution**.
- The forker can adjust yield, grind, equipment, taste notes, etc.

### 3.8 Visibility States

Recipes support the following visibility levels:

- **Draft** — work in progress, not visible to anyone else.
- **Private** — saved but only visible to the owner.
- **Unlisted** — accessible via direct link only, not listed publicly.
- **Public** — visible to everyone, searchable, indexable.

### 3.9 Comparison

- Two **public** recipes can be compared side-by-side.
- Comparison pages are shareable via URL.
- If either recipe loses public visibility, the comparison page becomes inaccessible.

### 3.10 Search & Filtering

- Recipes searchable by title and all structured fields.
- Multiple filter types can be combined (brew type, accessory, grinder, etc.).
- Active filter criteria are reflected in the URL (shareable filtered views).
- **Dedicated browse pages** for viewing all recipes grouped by resource (e.g. by grinder, by brew method, by bean, by vendor).

### 3.11 User Profiles

- Users have a **profile page** showing their public recipes, featured recipes, equipment, follower/following counts, and achievement badges.
- Private recipes are only visible to the owner on their own profile.
- Users cannot see other people's private recipes.

### 3.12 Derived Coffee Metrics

Computed from normalized stored values (never from display values):

- **Brew Ratio** — dose:yield
- **Flow Rate** — yield / extraction time
- **Extraction Yield** — where applicable

### 3.13 Achievement Badges

Gamification system to reward user engagement:

- Badges are awarded automatically when milestones are reached.
- Example badges:
  - ☕ **First Brew** — logged your first recipe.
  - 🔟 **Decade Brewer** — 10 recipes logged.
  - 💯 **Centurion** — 100 recipes logged.
  - 🍴 **First Fork** — forked your first recipe.
  - ⭐ **Fan Favourite** — one of your recipes received 10+ likes.
  - 🌟 **Community Star** — one of your recipes received 50+ likes.
  - 💬 **Conversationalist** — left 10+ comments.
  - 🎯 **Precision Brewer** — logged 10 recipes with all optional fields filled.
  - 🌍 **Explorer** — brewed with 5+ different brew methods.
  - 👥 **Influencer** — gained 25+ followers.
- Badges are displayed on user profiles.
- Badge definitions are stored in the database and manageable by admins.
- Badge evaluation can run as a **background job** to avoid slowing down user actions.
- New badge types can be added over time without schema changes (data-driven badge rules).

### 3.14 QR Code Generation

- Each **public or unlisted** recipe can generate a **QR code** linking to its URL.
- The QR code is generated server-side (or client-side via a library) on demand.
- QR codes are downloadable as **PNG or SVG**.
- Use case: sharing recipes at coffee events, printing on coffee bags, or posting in cafés.
- The QR code is accessible from the recipe detail page via a "Share" or "QR Code" button.
- QR codes for **private or draft** recipes are not available.
- If a recipe's visibility changes from public/unlisted to private/draft, existing QR codes lead to a proper "not available" page.

### 3.15 Brew Method Compatibility Matrix

The plan enforces hard validation that brew method and equipment must be compatible (e.g. Turkish coffee cannot use an espresso machine). This compatibility logic must be **data-driven, not hardcoded**.

- Store the compatibility matrix as a **configurable data table** in the database (e.g. `brew_method_equipment_rules`).
- Each row maps a brew method to the equipment types it's compatible with.
- Admins can **edit the matrix** from the admin panel — add new brew methods, add new equipment types, and update which combinations are valid.
- Validation logic reads from this table at runtime (cached in Deno KV for performance).
- Seed data should populate a sensible default matrix covering common methods:
  - Espresso machine → portafilter, basket, tamper, puck screen
  - V60 → paper filter, gooseneck kettle
  - Turkish coffee → cezve (ibrik)
  - French press → mesh filter
  - AeroPress → paper/metal filter
  - etc.
- If the matrix is updated by an admin, the cached version in Deno KV is flushed.

### 3.16 User Preferences

Users have a dedicated **preferences page** where they can set personal defaults. These preferences are stored **per-user in the database**, not in browser local storage, so they persist across devices.

- **Unit system** — metric (grams, ml, °C) or imperial (ounces, fl oz, °F). Controls how values are displayed throughout the UI. Stored data is always canonical (metric).
- **Temperature unit** — Celsius or Fahrenheit (independent override if user wants metric weight but Fahrenheit temp).
- **Theme** — Light, Dark, or Coffee Mode.
- **Locale / language** — selected from available app locales.
- **Timezone** — for correct display of dates/times. Auto-detected on first login, manually overridable.
- **Date format** — e.g. `DD/MM/YYYY`, `MM/DD/YYYY`, `YYYY-MM-DD`.
- **Email notification preferences** — toggle notifications for: new follower, recipe liked, recipe commented, followed user posted.

The UI layer reads these preferences and applies them globally. They never affect stored data.

### 3.17 Recipe Print View & Focus Mode

- **Print view** — a clean, printer-friendly layout for recipes. Strips navigation, sidebar, and social elements. Shows: recipe title, brew method, all parameters, taste notes, personal notes. Optimized for A4/Letter paper. Accessible via a "Print" button on the recipe detail page.
- **Reader focus mode** — a distraction-free reading view that removes navigation, comments, and sidebar. Centers the recipe content with comfortable reading typography. Toggled via a "Focus" button. Useful for following a recipe while actually brewing.

### 3.18 Onboarding Flow

After registration, first-time users see a guided setup wizard instead of an empty dashboard:

1. **Welcome screen** — brief intro to BrewForm.
2. **Add your equipment** — prompt to add their machine, grinder, and accessories (creates their first Setup).
3. **Add your beans** — prompt to add the coffee they currently have.
4. **Log your first brew** — guided recipe creation with inline tips explaining each field.
5. **Explore** — link to public recipes and popular brewers to follow.

The onboarding can be skipped at any step. A flag in the user record tracks onboarding completion so it's not shown again.

### 3.19 Cookie Consent & Privacy

- A **cookie consent banner** is shown to first-time visitors.
- Users can accept or reject non-essential cookies (analytics, preferences stored client-side).
- A **privacy policy page** is accessible from the footer, covering: data collection, storage, sharing, deletion rights.
- Consent preference is stored and respected throughout the session.

---

## 4. Data Normalization & Scale Rules

- All numeric values **stored in canonical units**:
  - Weight → grams
  - Volume → milliliters
  - Temperature → Celsius
  - Time → seconds
  - Unit conversion happens **only at the UI layer**.
- All filterable/comparable fields **must not be free-text** — they reference normalized entities (IDs) or enums.
- Equipment, beans, vendors, brew methods, drink types, and taste notes **normalized into dedicated tables** and referenced by ID.
- Derived metrics **computed from normalized values**, never display values.
- Social metadata (likes, comments, favourites, visibility, followers) **not versioned** with recipe content.
- Recipe content **versioned as immutable snapshots**.
- Search, filtering, comparison, and analytics **rely only on normalized and indexed fields**.
- Display formatting, unit preferences, and localization **never affect stored data**.
- Database indexes on **all normalized fields** used in filtering, sorting, or comparison.

---

## 5. Validation Rules

### 5.1 General

- Validation uses **Zod schemas**, applied consistently on both API and form submission.
- Rules classified as **hard** (blocks save) or **soft** (warns but allows save).

### 5.2 Hard Validation (Block Save)

- Grind date **cannot be earlier than** roast date.
- Required fields (brew method, dose, yield, grinder, brewer) **must be present**.
- Numeric values in physically valid ranges (weight > 0, volume > 0, time > 0).
- Brew method and equipment **must be compatible** per the compatibility matrix (§3.15).
- Referenced entities (equipment, beans, vendors) **must exist**.
- A recipe version **cannot be edited once created** (immutability).

### 5.3 Soft Validation (Warnings Only)

- Espresso ratio outside typical range (< 1:1.5 or > 1:3).
- Extraction time unusually short/long for selected brew method.
- Brew temperature outside common ranges for the brew method.
- Missing optional but commonly expected fields (e.g. extraction time for espresso).
- Extremely fine/coarse grind size relative to brew method.
- Milk preparation present for non-milk-based drink types.

### 5.4 UX Validation

- Soft warnings **never block saving**.
- Warnings shown inline and summarized before submission.
- Users can **override warnings intentionally**.
- Validation messages are **descriptive and educational**, not generic.

### 5.5 Data Integrity

- Validation always operates on **normalized values**, not display values.
- Validation logic **shared between frontend and backend** where possible.
- Invalid historical data **must not break** rendering or comparisons.

---

## 6. Technical Stack

| Layer | Technology |
|---|---|
| Runtime | Deno (use `package.json` and `package-lock.json` for compatibility) |
| Monorepo | Turborepo (npm workspaces) |
| Backend Framework | Hono |
| Frontend Framework | React (static SPA build via Vite) |
| UI Library | BaseUI |
| ORM | Prisma |
| Database | PostgreSQL (Deno Deploy managed or external) |
| Cache / KV Store | Deno KV (replaces Redis — built into Deno runtime) |
| Email Templates | MJML |
| Logging | Pino (structured, with secret redaction) |
| Validation | Zod (config, requests, forms — shared between frontend and backend) |
| Date Utilities | date-fns |
| OpenAPI | hono-openapi (auto-generates spec from Zod schemas) |
| Testing | Deno built-in test runner (`deno test`) |
| Test Style | BDD via `@std/testing/bdd` (describe/it/beforeEach/afterEach/beforeAll/afterAll) |
| Assertions | `@std/expect` for Jest-like syntax (toBe/toEqual/toContain/toThrow etc.) + `@std/assert` |
| Coverage | `deno coverage` (built-in) |
| Linting | `deno lint` (built-in, configurable via `deno.json`) |
| Formatting | `deno fmt` (built-in, configurable via `deno.json`) |
| Type Checking | `deno check` (built-in) |
| Env Loading | `--env-file` flag (built-in) + `@std/dotenv` if needed |
| i18n | JSON locale files (or a de-facto JS i18n library) — shared package |
| CI/CD | GitHub Actions |
| Backend Deployment | Deno Deploy (free plan) |
| Frontend Deployment | GitHub Pages (static) |

**Do not use import maps.** All imports should use explicit specifiers.

### 6.1 Deno KV (Replacing Redis)

The project uses **Deno KV** instead of Redis for all caching and key-value storage needs. Deno KV is built into the Deno runtime — no external service required.

**How it works across environments:**

| Environment | Backend |
|---|---|
| Local development | SQLite file (automatic, no config needed) |
| Tests | In-memory via `Deno.openKv(":memory:")` |
| Deno Deploy (production) | Globally distributed KV store (automatic) |

**Usage pattern:**

```typescript
const kv = await Deno.openKv();

// Cache with TTL (e.g. taste notes taxonomy — 24 hours)
await kv.set(["cache", "taste-notes"], taxonomyData, { expireIn: 86400000 });

// Read from cache
const cached = await kv.get(["cache", "taste-notes"]);
if (cached.value) { /* use cached data */ }

// Flush cache
await kv.delete(["cache", "taste-notes"]);

// List by prefix
const entries = kv.list({ prefix: ["cache"] });
for await (const entry of entries) { /* ... */ }
```

**What Deno KV is used for:**
- Taste notes taxonomy cache (flush on admin changes)
- Brew method compatibility matrix cache (flush on admin changes)
- Rate limiting counters
- Session data if needed
- Popular/trending recipe caches
- Any other ephemeral or computed data

**What Deno KV is NOT used for:**
- Persistent application data — that's PostgreSQL.

### 6.2 Abstraction Layers (Driver Portability)

Both the cache layer and the database layer are designed behind **interfaces**, so the underlying driver can be swapped later without touching business logic.

#### Cache Interface

All application code interacts with a `CacheProvider` interface, **never** with `Deno.openKv()` directly. The current implementation is `DenoKVCacheProvider`. A `RedisCacheProvider`, `ValkeyCacheProvider`, or any other backend can be added later by implementing the same interface.

```typescript
/**
 * Abstract cache provider interface.
 * All cache consumers depend on this — never on a concrete driver.
 */
interface CacheProvider {
  get<T>(key: string[]): Promise<T | null>;
  set<T>(key: string[], value: T, options?: { ttlMs?: number }): Promise<void>;
  delete(key: string[]): Promise<void>;
  deleteByPrefix(prefix: string[]): Promise<void>;
}
```

**Implementations:**

```typescript
// Current implementation — Deno KV
class DenoKVCacheProvider implements CacheProvider {
  private kv: Deno.Kv;

  async get<T>(key: string[]): Promise<T | null> {
    const result = await this.kv.get(key);
    return result.value as T | null;
  }

  async set<T>(key: string[], value: T, options?: { ttlMs?: number }): Promise<void> {
    await this.kv.set(key, value, options?.ttlMs ? { expireIn: options.ttlMs } : {});
  }

  async delete(key: string[]): Promise<void> {
    await this.kv.delete(key);
  }

  async deleteByPrefix(prefix: string[]): Promise<void> {
    const entries = this.kv.list({ prefix });
    for await (const entry of entries) {
      await this.kv.delete(entry.key);
    }
  }
}

// Future swap — just implement the same interface
// class RedisCacheProvider implements CacheProvider { ... }
// class ValkeyCacheProvider implements CacheProvider { ... }
```

**Wiring:** The active `CacheProvider` is instantiated once (singleton) in the config/bootstrap layer based on an env variable (e.g. `CACHE_DRIVER=deno-kv`). Services receive it via dependency injection.

```typescript
// config/cache.ts
function createCacheProvider(driver: string): CacheProvider {
  switch (driver) {
    case 'deno-kv': return new DenoKVCacheProvider();
    // case 'redis': return new RedisCacheProvider(redisUrl);
    default: throw new Error(`Unknown cache driver: ${driver}`);
  }
}
```

**Testing:** Tests use an in-memory implementation (or `Deno.openKv(":memory:")` wrapped in the interface) for isolation.

**Rules:**
- No service, controller, or utility may call `Deno.openKv()` directly.
- All cache access goes through the injected `CacheProvider` instance.
- The `.env.example` documents `CACHE_DRIVER` with available options.

#### Database Portability via Prisma

Prisma already serves as the database abstraction layer. It supports PostgreSQL, MySQL, SQLite, SQL Server, CockroachDB, and MongoDB. Switching the underlying database is a config-level change:

1. Change `provider` in `schema.prisma` (e.g. `postgresql` → `mysql`).
2. Update `DATABASE_URL` in `.env`.
3. Re-run `prisma migrate`.

To keep this portability real and not theoretical, the codebase must follow these **portability rules:**

- **No raw SQL.** All queries go through Prisma Client. If a query can't be expressed via Prisma's API, abstract it behind a repository method and document the dialect dependency.
- **No Postgres-specific Prisma features** in the schema unless isolated. Avoid `@db.JsonB`, `@db.Uuid`, Postgres-specific `@@index` types (GIN, GiST), and Postgres-specific `dbgenerated()` calls. If unavoidable, isolate them behind a clearly marked module with a comment: `// POSTGRES-SPECIFIC: replace if switching DB`.
- **No Postgres-specific operators** in queries (e.g. `mode: 'insensitive'` for case-insensitive search is Postgres-only in Prisma). Use application-level normalization or document the dependency.
- **Full-text search:** If implemented, abstract it behind a `SearchProvider` interface similar to the cache pattern, since FTS syntax differs across databases.
- **Services never import from `@prisma/client` directly.** They import from model files in each module, which wrap Prisma calls. This is already enforced by the module structure (§6.4).

The `.env.example` documents `DATABASE_PROVIDER` alongside `DATABASE_URL` for clarity, even though the actual switch requires a schema change.

### 6.3 Docker Setup (Local Development)

- **Dockerfile:** Use `denoland/deno:debian-2.7.13` image for builder and runner.
- **docker-compose.yml** includes:
  - App container (Hono backend API)
  - PostgreSQL
  - **Mailpit** — for email testing
  - **pgAdmin** (`elestio/pgadmin` image) — for DB web interface
- No Redis container needed — Deno KV handles caching locally via SQLite.
- Start with: `docker compose up -d`
- **All Deno-related commands** (`deno`, `deno test`, `deno lint`, `deno fmt`, `deno check`, `deno coverage`, `npm`, `npx`, etc.) **must run via Docker containers**. Assume the user does not have Deno or any JS runtime installed locally.

#### Docker Multi-Stage Build

The Dockerfile should use a multi-stage build optimized for layer caching in a monorepo:

```dockerfile
# --- Stage 1: Dependencies ---
FROM denoland/deno:debian-2.7.13 AS deps
WORKDIR /app
# Copy all workspace package.json files first for layer caching
COPY package.json package-lock.json turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
RUN npm install

# --- Stage 2: Build ---
FROM denoland/deno:debian-2.7.13 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY . .
RUN npx prisma generate --schema=packages/db/prisma/schema.prisma
RUN deno check apps/api/src/main.ts

# --- Stage 3: Runtime (API only) ---
FROM denoland/deno:debian-2.7.13 AS runner
WORKDIR /app
COPY --from=builder /app .
EXPOSE 8000
CMD ["deno", "run", "--allow-all", "--env-file", "apps/api/src/main.ts"]
```

Key principles:
- All workspace `package.json` files are copied first so `npm install` runs in its own cached layer. Source code changes don't trigger a full dependency reinstall.
- The runtime stage runs only the API (`apps/api`). The frontend (`apps/web`) is built separately and deployed to GitHub Pages (see §11.2).

### 6.4 Monorepo Structure (Turborepo)

The project is a **Turborepo monorepo** using npm workspaces. A single repository contains the backend API, frontend SPA, and shared packages. Deno natively supports npm workspaces and the `workspace:*` protocol.

#### Root-Level Layout

```
brewform/
├── package.json              # root: workspaces config + turbo devDep
├── package-lock.json
├── turbo.json                # task pipeline (build, lint, test, check)
├── deno.json                 # lint/fmt/test tooling config (no import maps)
├── .env.example
├── Makefile
├── Dockerfile
├── docker-compose.yml
├── apps/
│   ├── api/                  # Hono backend → Deno Deploy
│   └── web/                  # React SPA → GitHub Pages
├── packages/
│   ├── shared/               # Types, Zod schemas, constants, utils
│   └── db/                   # Prisma schema, migrations, client
├── files/
│   └── scaa-2.json           # SCAA flavor wheel data
└── docs/                     # Feature documentation
```

#### Root `package.json`

```json
{
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "check": "turbo run check"
  },
  "devDependencies": {
    "turbo": "latest"
  }
}
```

#### `turbo.json`

```json
{
  "$schema": "https://turborepo.dev/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "check": {},
    "test": {
      "dependsOn": ["^build"]
    }
  }
}
```

Turbo orchestrates tasks across all workspaces — running `turbo run test` executes tests in `apps/api`, `apps/web`, and `packages/shared` in the correct dependency order, with caching.

#### `apps/api/` — Backend (Hono API)

```
apps/api/
├── package.json              # deps: @brewform/shared, @brewform/db, hono, pino, etc.
├── src/
│   ├── main.ts               # Hono app entry point
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── index.ts      # controller
│   │   │   ├── service.ts    # service
│   │   │   └── model.ts      # model (Prisma wrapper)
│   │   ├── user/
│   │   ├── recipe/
│   │   ├── equipment/
│   │   ├── bean/
│   │   ├── vendor/
│   │   ├── taste/
│   │   ├── comment/
│   │   ├── setup/
│   │   ├── follow/
│   │   ├── badge/
│   │   ├── photo/
│   │   ├── preference/
│   │   ├── admin/
│   │   └── config/
│   │       └── index.ts      # env loader with Zod validation
│   ├── middleware/
│   │   ├── cors.ts           # CORS config (uses hono/cors)
│   │   ├── requestId.ts      # Request ID (uses hono/request-id)
│   │   ├── errorHandler.ts   # Global error handler
│   │   └── auth.ts           # JWT verification
│   └── utils/
│       ├── logger/
│       │   └── index.ts      # Pino structured logger (with secret redaction)
│       ├── cache/
│       │   └── index.ts      # CacheProvider interface + DenoKVCacheProvider
│       ├── qrcode/
│       ├── upload/
│       └── response/
│           └── index.ts      # API response envelope helper
└── ...
```

**`apps/api/package.json` dependencies include:**
```json
{
  "name": "@brewform/api",
  "dependencies": {
    "@brewform/shared": "workspace:*",
    "@brewform/db": "workspace:*",
    "hono": "...",
    "hono-openapi": "...",
    "pino": "...",
    "date-fns": "...",
    "mjml": "..."
  }
}
```

#### `apps/web/` — Frontend (React SPA)

```
apps/web/
├── package.json              # deps: @brewform/shared, react, base-ui, vite, etc.
├── vite.config.ts
├── index.html
├── src/
│   ├── main.tsx              # React entry point
│   ├── pages/
│   ├── components/
│   ├── hooks/
│   ├── api/                  # API client (fetches from backend)
│   └── styles/
└── ...
```

**`apps/web/package.json` dependencies include:**
```json
{
  "name": "@brewform/web",
  "dependencies": {
    "@brewform/shared": "workspace:*",
    "react": "...",
    "react-dom": "...",
    "@base-ui-components/react": "..."
  },
  "devDependencies": {
    "vite": "..."
  }
}
```

The frontend imports Zod schemas, types, constants, and utility functions from `@brewform/shared`. It **never** imports from `@brewform/db` — the database is backend-only.

#### `packages/shared/` — Shared Code

This is the core benefit of the monorepo. Code that was previously duplicated or out of sync between frontend and backend lives here once.

```
packages/shared/
├── package.json
├── src/
│   ├── types/
│   │   ├── recipe.ts         # Recipe, RecipeVersion, RecipeCreate, RecipeUpdate types
│   │   ├── equipment.ts      # Equipment, Portafilter, Grinder, etc.
│   │   ├── taste.ts          # TasteNote, TasteHierarchy types
│   │   ├── user.ts           # User, UserProfile, UserPreferences types
│   │   ├── api.ts            # ApiResponse<T>, ApiError, PaginationMeta types
│   │   └── index.ts          # barrel export
│   ├── schemas/
│   │   ├── recipe.ts         # Zod schemas for recipe creation, update, filtering
│   │   ├── equipment.ts      # Zod schemas for equipment
│   │   ├── auth.ts           # Zod schemas for login, register, reset password
│   │   ├── user.ts           # Zod schemas for profile, preferences
│   │   └── index.ts          # barrel export
│   ├── constants/
│   │   ├── brew-methods.ts   # Brew method enum/list
│   │   ├── drink-types.ts    # Drink type enum/list
│   │   ├── emoji-tags.ts     # Emoji quick-tag definitions
│   │   ├── units.ts          # Canonical units, conversion factors
│   │   └── index.ts
│   ├── utils/
│   │   ├── conversion.ts     # grams↔ounces, ml↔fl oz, °C↔°F converters
│   │   ├── metrics.ts        # brewRatio(), flowRate(), extractionYield()
│   │   ├── validation.ts     # Soft validation helpers (ratio ranges, temp ranges)
│   │   ├── date.ts           # Date comparison helpers (grind vs roast)
│   │   └── index.ts
│   └── i18n/
│       ├── en.json           # English locale
│       ├── tr.json           # Turkish locale (example)
│       └── index.ts          # Locale loader
└── ...
```

**`packages/shared/package.json`:**
```json
{
  "name": "@brewform/shared",
  "type": "module",
  "exports": {
    "./types": { "types": "./src/types/index.ts", "default": "./src/types/index.ts" },
    "./schemas": { "types": "./src/schemas/index.ts", "default": "./src/schemas/index.ts" },
    "./constants": { "types": "./src/constants/index.ts", "default": "./src/constants/index.ts" },
    "./utils": { "types": "./src/utils/index.ts", "default": "./src/utils/index.ts" },
    "./i18n": { "types": "./src/i18n/index.ts", "default": "./src/i18n/index.ts" }
  },
  "dependencies": {
    "zod": "...",
    "date-fns": "..."
  }
}
```

**Usage from either app:**
```typescript
// In apps/api or apps/web — same import, same schema, always in sync
import { RecipeCreateSchema, RecipeFilterSchema } from '@brewform/shared/schemas';
import { computeBrewRatio, convertGramsToOunces } from '@brewform/shared/utils';
import { BREW_METHODS, EMOJI_TAGS } from '@brewform/shared/constants';
import type { Recipe, ApiResponse } from '@brewform/shared/types';
```

#### `packages/db/` — Database (Prisma)

```
packages/db/
├── package.json
├── prisma/
│   ├── schema.prisma         # Prisma schema (provider, models, indexes)
│   ├── migrations/           # All Prisma migrations
│   └── seed.ts               # Seed data (recipes, users, taste notes, matrix)
├── src/
│   └── index.ts              # Exports Prisma client instance (singleton)
└── ...
```

**`packages/db/package.json`:**
```json
{
  "name": "@brewform/db",
  "type": "module",
  "exports": {
    ".": { "types": "./src/index.ts", "default": "./src/index.ts" }
  },
  "dependencies": {
    "@prisma/client": "...",
    "@brewform/shared": "workspace:*"
  },
  "devDependencies": {
    "prisma": "..."
  }
}
```

**Only `apps/api` depends on `@brewform/db`.** The frontend never imports it.

#### Dependency Graph

```
apps/web ──────→ packages/shared
                      ↑
apps/api ──┬──→ packages/shared
           └──→ packages/db ──→ packages/shared
```

### 6.5 API Middleware Stack

The Hono app applies the following middleware globally, in order:

#### CORS

```typescript
import { cors } from 'hono/cors';

app.use('/api/*', cors({
  origin: config.CORS_ALLOWED_ORIGINS, // from env: e.g. "https://brewform.github.io"
  allowHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
  maxAge: 600,
}));
```

CORS is critical because the frontend (GitHub Pages) and backend (Deno Deploy) are on separate origins.

#### Request ID

```typescript
import { requestId } from 'hono/request-id';

app.use('*', requestId());
// Access via c.get('requestId') in any handler
// Pass to Pino logger for correlation across all log entries
```

Every request gets a unique ID. It's included in all log entries and returned in the response header (`X-Request-ID`) so the client can reference it in bug reports.

#### Global Error Handler

A centralized error handler catches all unhandled exceptions and returns a consistent error envelope:

```typescript
app.onError((err, c) => {
  const requestId = c.get('requestId');
  logger.error({ err, requestId }, 'Unhandled error');

  // Prisma errors, Zod validation errors, auth errors, 404s
  // all mapped to appropriate status codes and consistent envelope
  return c.json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong',
      requestId,
    },
  }, 500);
});
```

#### API Response Envelope

All API responses follow a consistent structure:

```typescript
// Success
{
  "success": true,
  "data": { /* payload */ },
  "meta": {
    "requestId": "abc-123",
    "pagination": { "page": 1, "perPage": 20, "total": 142 } // if applicable
  }
}

// Error
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Grind date cannot be earlier than roast date",
    "details": [ /* field-level errors */ ],
    "requestId": "abc-123"
  }
}
```

Create a response helper utility so every endpoint uses this envelope consistently.

### 6.6 Authentication Strategy (JWT)

- **Access token** — short-lived JWT (e.g. 15 minutes), sent in `Authorization: Bearer <token>` header.
- **Refresh token** — long-lived (e.g. 7 days), stored in an HTTP-only secure cookie or DB-backed.
- On access token expiry, the client uses the refresh token to obtain a new access token without re-login.
- **Password reset** — sends a time-limited reset token via email (MJML template, testable via Mailpit).
- JWT secret is loaded from env config. Pino logger is configured to **redact secrets** so tokens never appear in logs.

### 6.7 Graceful Shutdown

The app listens for `SIGTERM` and `SIGINT` signals and shuts down cleanly:

1. Stop accepting new requests.
2. Wait for in-flight requests to complete (with a timeout).
3. Close the Prisma DB connection pool.
4. Close the Deno KV connection.
5. Flush any pending log entries.
6. Exit with code 0.

This is important for Kubernetes deployments and Deno Deploy's lifecycle management.

### 6.8 Database Connection Pooling

Prisma's connection pool size and timeout are configurable via environment variables:

```
DATABASE_URL=postgresql://user:pass@host:5432/brewform?connection_limit=10&pool_timeout=30
```

- **`connection_limit`** — max connections in the pool. Default suitable for Deno Deploy free plan.
- **`pool_timeout`** — seconds to wait for a connection from the pool before erroring.
- Document recommended values for local dev vs production in `.env.example`.

### 6.9 OpenAPI Specification

The API can auto-generate an OpenAPI 3.1.0 spec using **`hono-openapi`**, which reads directly from the existing Zod validation schemas — no duplicate schema definitions needed.

**Controlled via env config:**

```
OPENAPI_ENABLED=true   # set to false in production if desired
```

When enabled, the following endpoints are available:
- `GET /api/v1/openapi.json` — the generated OpenAPI spec.
- `GET /api/v1/docs` — Swagger UI or similar viewer (optional).

When disabled, these endpoints return 404.

**Example route with OpenAPI metadata:**

```typescript
import { describeRoute, resolver, validator } from 'hono-openapi';

app.get(
  '/api/v1/recipes',
  describeRoute({
    tags: ['Recipes'],
    summary: 'List public recipes',
    responses: {
      200: {
        description: 'Paginated list of recipes',
        content: {
          'application/json': {
            schema: resolver(RecipeListResponseSchema), // your existing Zod schema
          },
        },
      },
    },
  }),
  validator('query', RecipeFilterSchema), // your existing Zod schema
  async (c) => { /* handler */ }
);
```

### 6.10 Environment & Configuration

- `.env.example` provided with all config keys.
- Config module loads and validates env using Zod.
- Env loading uses Deno's built-in `--env-file` flag or `@std/dotenv`.
- **App must build without any `.env` file provided.**
- Secrets (JWT key, DB password, email credentials) must be **redacted in Pino logs** via Pino's `redact` option.

### 6.11 Deno Configuration (`deno.json`)

The project uses **`package.json`** for all dependency management and npm scripts. A **minimal `deno.json`** exists **only** for Deno-specific tooling configuration (`lint`, `fmt`, `test`, `compilerOptions`) — these settings have no equivalent in `package.json`.

**`deno.json` must NOT contain:**
- Import maps or `"imports"` field — all imports use explicit specifiers.
- Task definitions — tasks live in the Makefile.
- Dependency declarations — these belong in `package.json`.

**`deno.json` contains only tooling config. Example:**

```json
{
  "compilerOptions": {
    "strict": true,
    "jsx": "react-jsx",
    "jsxImportSource": "react"
  },
  "lint": {
    "include": ["src/"],
    "exclude": ["src/generated/"],
    "rules": {
      "tags": ["recommended"]
    }
  },
  "fmt": {
    "useTabs": false,
    "lineWidth": 100,
    "indentWidth": 2,
    "singleQuote": true,
    "semiColons": true,
    "include": ["src/"],
    "exclude": ["src/generated/"]
  },
  "test": {
    "include": ["src/"],
    "exclude": ["src/generated/"]
  }
}
```

**Dependency flow:** `package.json` + `package-lock.json` → `npm install` → `node_modules/`. Deno reads `node_modules` automatically. No import maps involved.

### 6.12 Makefile

All commands live in the Makefile, executed through `docker compose`. Assume the user does **not** have Deno or any JS runtime installed locally. Every Deno, npm, and npx command must go through Docker.

**Use `docker compose run --rm` vs `docker compose exec`:**

- **`docker compose run --rm app <cmd>`** — spins up a disposable container, runs the command, and removes it. Use for standalone tooling commands that don't need the full stack running (lint, fmt, test, check, coverage, prisma generate, install).
- **`docker compose exec app <cmd>`** — runs inside an already-running container. Use only for commands that need the live stack (e.g. interacting with the running app, or commands that depend on the DB being available through docker-compose networking).

**Example Makefile:**

```makefile
# ============================================================
# BrewForm — Makefile (Turborepo Monorepo)
# All commands run through Docker. No local Deno/Node required.
# ============================================================

# --- App Lifecycle ---

up:
	docker compose up -d

down:
	docker compose down

build:
	docker compose build

logs:
	docker compose logs -f app

restart:
	docker compose restart app

# --- Dependencies ---

install:
	docker compose run --rm app npm install

# --- Turbo Tasks (standalone — runs across all workspaces) ---

turbo-build:
	docker compose run --rm app npx turbo run build

turbo-test:
	docker compose run --rm app npx turbo run test

turbo-lint:
	docker compose run --rm app npx turbo run lint

turbo-check:
	docker compose run --rm app npx turbo run check

# --- Code Quality (standalone — no running stack needed) ---

lint:
	docker compose run --rm app deno lint

fmt:
	docker compose run --rm app deno fmt

fmt-check:
	docker compose run --rm app deno fmt --check

check:
	docker compose run --rm app deno check apps/api/src/main.ts

# --- Testing (standalone — no running stack needed) ---

test:
	docker compose run --rm app deno test --coverage=coverage/

coverage:
	docker compose run --rm app deno coverage coverage/

test-coverage: test coverage

# --- Database (needs DB running — paths relative to packages/db) ---

db-migrate:
	docker compose exec app npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma

db-generate:
	docker compose run --rm app npx prisma generate --schema=packages/db/prisma/schema.prisma

db-seed:
	docker compose exec app deno run --allow-all packages/db/prisma/seed.ts

db-studio:
	docker compose exec app npx prisma studio --schema=packages/db/prisma/schema.prisma

db-reset:
	docker compose exec app npx prisma migrate reset --force --schema=packages/db/prisma/schema.prisma

# --- Admin Setup ---

setup:
	docker compose exec app deno run --allow-all apps/api/src/setup.ts

# --- Frontend (standalone) ---

web-build:
	docker compose run --rm app npx turbo run build --filter=@brewform/web

web-dev:
	docker compose run --rm --service-ports app npx turbo run dev --filter=@brewform/web

# --- All-in-one CI check (standalone) ---

ci: fmt-check lint check test-coverage
```

**Key principles:**
- If it touches the DB or the running app → `exec`. If it just needs the source code and Deno runtime → `run --rm`.
- `npx turbo run <task>` orchestrates across all workspaces respecting the dependency graph. Use `--filter=@brewform/web` or `--filter=@brewform/api` to target a single workspace.
- `deno lint`, `deno fmt`, `deno check` run globally across the whole repo from root.

---

## 7. Authentication & Authorization

- **Register, Login, Reset Password via email.**
- JWT-based authentication (see §6.6 for strategy details).
- Email sending uses MJML templates, testable via Mailpit.

---

## 8. Admin Panel

Admins can:

- **Create or ban users.** Banned users' shared content is hidden.
- **CRUD all common resources:** coffee, vendors, accessories, formulas, brewers.
- **CRUD taste notes.** Placeholder section with a note that cached taste notes are flushed on any change.
- **Edit brew method compatibility matrix** (§3.15). Flushing Deno KV cache on changes.
- **Manage achievement badge definitions.**
- **Modify recipe visibility** (share/unshare).
- **Audit log** of all admin actions.

### First Admin

- Created via a migration.
- Password is randomly generated and **printed to stdout** during the setup command.

---

## 9. Frontend & UX

### 9.1 Architecture

The frontend is a **static React SPA**, built and deployed separately from the backend API.

- Built with a bundler (e.g. Vite) into static HTML/JS/CSS.
- Communicates with the backend exclusively via the versioned REST API.
- Deployed to **GitHub Pages**.
- CORS is configured on the backend to accept requests from the GitHub Pages origin.

### 9.2 Design

- Responsive, modern, eye-candy design.
- **Three themes:** Light, Dark, and **Coffee Mode** (brown pantone palette).
- Theme preference stored per-user in the database (§3.16), with a fallback to system preference for logged-out users.
- SVG icons for brew types where available (e.g. V60 kettle icon). If no suitable icon exists, skip gracefully.

### 9.3 Landing Page

- Navigation menu, footer.
- **Latest public recipes** section.
- **Most starred recipes** section.

### 9.4 Error Pages

- Custom error pages (404, 500, etc.).
- Fun illustrations (e.g. broken French press, spilled coffee glass).

### 9.5 SEO & Social Sharing

- SEO-friendly pages, easily indexable.
- Structured data (JSON-LD or similar).
- Slug strategy and canonical URLs for all public pages.
- Pagination with proper `rel` tags.
- **Open Graph meta tags** on all public recipe pages — when a recipe URL is shared on social platforms (Twitter, Discord, WhatsApp, etc.), it should render a rich card with:
  - Recipe title
  - Brew method and category
  - Star rating
  - Recipe photo (if available, otherwise a default BrewForm card)
  - Site name: BrewForm
- OG tags also on user profile pages (username, recipe count, avatar).
- For the SPA, use **server-side rendering or pre-rendering** for public recipe pages to ensure social crawlers and search engines receive proper meta tags. Alternatively, a lightweight meta-tag service on the backend can serve OG tags for shared URLs.

### 9.6 Onboarding

See §3.18 for the guided setup wizard flow.

### 9.7 Cookie Consent

See §3.19 for cookie consent banner and privacy policy details.

---

## 10. API & Infrastructure

### 10.1 API Design

- **Versioned API** (e.g. `/api/v1/`).
- Rate limiting (counters stored in Deno KV).
- Health (`/health`) and readiness (`/ready`) probe endpoints for Kubernetes and Deno Deploy.
- CORS middleware on all `/api/*` routes (§6.5).
- Request ID on all requests (§6.5).
- Consistent response envelope on all endpoints (§6.5).
- OpenAPI spec endpoint toggleable via env config (§6.9).

### 10.2 Caching & Performance

- **Deno KV** for caching (taste notes taxonomy, compatibility matrix, popular recipes, rate limits, etc.).
- Background job tasks (e.g. cache refresh, badge evaluation) executable via API commands.
- Pagination on all list endpoints.

### 10.3 Reporting & Moderation

- Content reporting mechanism.
- Moderation tools in admin panel.

### 10.4 Analytics

- Basic analytics for users (recipe views, likes over time) and admins (usage stats).

---

## 11. Deployment

### 11.1 Architecture Overview

```
┌──────────────────┐       ┌──────────────────────────┐
│  GitHub Pages    │       │    Deno Deploy (free)     │
│  (Static SPA)    │──────▶│    Hono API + Prisma      │
│  React frontend  │ CORS  │    Deno KV (cache)        │
└──────────────────┘       │    PostgreSQL (managed)    │
                           └──────────────────────────┘
```

- **Frontend:** Static React SPA → GitHub Pages.
- **Backend:** Hono API → Deno Deploy (free plan). Deno Deploy natively runs Hono.
- **Database:** PostgreSQL on Deno Deploy (managed via Prisma) or external.
- **Cache:** Deno KV — built into Deno Deploy, no separate service.
- **Email:** Production email provider configured via env. Mailpit for local dev only.

### 11.2 GitHub Actions CI/CD

A single GitHub Actions workflow triggered on every push to `main`. Turbo orchestrates the build/test pipeline and caches results across runs.

```yaml
name: CI & Deploy

on:
  push:
    branches: [main]

jobs:
  # --- Step 1: Lint, format check, type check, test (all workspaces) ---
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v2
      - run: npm install
      - run: deno fmt --check
      - run: deno lint
      - run: npx turbo run check        # type-check all workspaces
      - run: npx turbo run test          # test all workspaces in dependency order
      - run: deno coverage coverage/

  # --- Step 2: Deploy backend to Deno Deploy ---
  deploy-backend:
    needs: ci
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/deployctl@v1
        with:
          project: brewform-api
          entrypoint: apps/api/src/main.ts

  # --- Step 3: Build and deploy frontend to GitHub Pages ---
  deploy-frontend:
    needs: ci
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v2
      - run: npm install
      - run: npx turbo run build --filter=@brewform/web
      - uses: actions/upload-pages-artifact@v3
        with:
          path: apps/web/dist/
      - uses: actions/deploy-pages@v4
```

### 11.3 Local Development vs Production

| Concern | Local (Docker Compose) | Production (Deno Deploy) |
|---|---|---|
| Runtime | `denoland/deno:debian-2.7.13` container | Deno Deploy runtime |
| Database | PostgreSQL container | Deno Deploy managed Postgres or external |
| Cache | Deno KV (SQLite file, automatic) | Deno KV (global, automatic) |
| Email | Mailpit container | Production email provider |
| DB Admin | pgAdmin container | External tool or Prisma Studio |

---

## 12. Database & Migrations

### 12.1 ORM & Migrations

- Prisma ORM with migrations for all schema changes.
- Soft deletes on all tables.
- Proper indexes on all filterable, sortable, and comparable fields.
- Connection pooling configurable via `DATABASE_URL` params (§6.8).
- Follow the **database portability rules** in §6.2 — no raw SQL, no dialect-specific Prisma features unless isolated and documented.

### 12.2 Seed Data

- Migration includes realistic sample brewing recipes with full equipment details.
- Fake users populated.
- All app features have seed data so the initial state is not a blank page.
- SCAA 2016 taste notes imported with full 3-level hierarchy via dedicated migration.
- Default brew method compatibility matrix seeded.
- Sample follow relationships and a few achievement badges seeded.

---

## 13. Additional Core Considerations

- **Formula versioning and edit history** — immutable snapshots.
- **Forking/remixing** with attribution to original.
- **Canonical unit storage** with UI-only conversion.
- **Derived metrics** computed server-side from canonical values.
- **i18n and timezone readiness** — basic translation layer with JSON locales.
- **Slug strategy and canonical URLs.**
- **Explicit non-goals** documented to avoid scope creep.
- **Singleton pattern** honored where appropriate.

---

## 14. Testing & Quality

- **Deno's built-in test runner** (`deno test`) for all tests.
- **BDD syntax** via `@std/testing/bdd` — `describe`, `it`, `beforeEach`, `afterEach`, `beforeAll`, `afterAll`.
- **Jest-like assertions** via `@std/expect` — `expect(x).toBe(y)`, `toEqual`, `toContain`, `toBeTruthy`, `toThrow`, etc.
- **Additional assertions** via `@std/assert` — `assertEquals`, `assertThrows`, etc.
- **Coverage** via `deno coverage` — generates coverage reports from test runs.
- **85% minimum coverage** across the entire app.
- **90% minimum coverage** for all taste note related code.
- Code must be testable by design (dependency injection, service isolation).
- **Deno KV in tests:** use `Deno.openKv(":memory:")` for isolated, ephemeral KV stores per test.
- All tests run through Docker (`docker compose run --rm app deno test` or via `make test`).

---

## 15. CI/CD

- **GitHub Actions** workflow.
- Triggered on every push to `main` branch.
- **Turbo orchestrates** cross-workspace tasks (`turbo run test`, `turbo run check`, `turbo run build`) — respecting the dependency graph and caching results.
- CI steps use the Makefile targets where possible (which internally use `docker compose run --rm`):
  - `make fmt-check` — verify formatting (global, all workspaces).
  - `make lint` — lint the codebase (global, all workspaces).
  - `make turbo-check` — type-check all workspaces via turbo.
  - `make turbo-test` — test all workspaces via turbo in dependency order.
  - `make coverage` — generate and validate coverage thresholds.
- Alternatively, `make ci` runs format check, lint, check, test, and coverage in sequence.
- After CI passes, deployment jobs run (see §11.2):
  - Backend → Deno Deploy via `deployctl` (entrypoint: `apps/api/src/main.ts`).
  - Frontend → GitHub Pages via `actions/deploy-pages` (build: `turbo run build --filter=@brewform/web`, artifact: `apps/web/dist/`).

---

## 16. Documentation

### 16.1 Project Documentation

- `docs/` folder with feature documentation in separate markdown files.
- Each major feature (auth, recipes, taste notes, versioning, forking, comparison, etc.) gets its own doc file.
- Code blocks used for API endpoint examples, request/response samples, and configuration snippets.

### 16.2 Code Comments

- **Do comment:** non-obvious business logic, "why" decisions, validation rule rationale, workarounds, edge cases, and anything where the intent isn't clear from the code alone.
- **Do not comment:** obvious or self-explanatory code. No `// increment counter` above `counter++`. No `// return the user` above `return user`. If the function name and types already explain what's happening, a comment adds noise, not clarity.
- Use **JSDoc/TSDoc blocks** on exported functions, services, and module entry points — document parameters, return types, thrown errors, and usage examples in codeblocks where helpful.
- Complex algorithms, derived metric calculations, and validation chains should have a brief prose comment explaining the approach before the implementation.

**Good example:**
```typescript
/**
 * Computes the brew ratio from dose and yield.
 * Both values must be in grams (canonical unit).
 * Returns null if either value is missing or zero.
 */
function computeBrewRatio(doseGrams: number, yieldGrams: number): number | null {
  // ...
}
```

**Bad example (do not do this):**
```typescript
// This function computes the brew ratio
// It takes dose and yield as parameters
// It returns a number
function computeBrewRatio(doseGrams: number, yieldGrams: number): number | null {
  // get the dose
  const dose = doseGrams;
  // get the yield
  const yieldVal = yieldGrams;
  // return the ratio
  return yieldVal / dose;
}
```

### 16.3 Unit Test Documentation

- Test names should be descriptive and read like specifications: `"should reject grind date earlier than roast date"`, not `"test date validation"`.
- Group related tests with `describe` blocks that name the module or behavior under test.
- No comments needed on straightforward assertions — the test name carries the intent.

---

## 17. Development Notes

- Always use **Context7 MCP server** for library documentation and dependencies (Hono, React, BaseUI, Prisma, Postgres, date-fns, hono-openapi, etc.). Ensure all packages are installed at their newest versions.
- Follow Hono.js best practices.
- All Deno/npm/npx/test/lint commands run through Docker containers.
- **Do not use import maps.** Use explicit import specifiers everywhere.
- Today's date for reference: **2026-04-25**.

---

## 18. Suggested Additional Features

Consider for future scope (not in initial build unless decided otherwise):

- **Brew timer** — built-in timer on the recipe creation page.
- **Brew method guides** — educational content for each brewing method.
- **Weekly/monthly digest emails** — popular recipes and community highlights.
- **Export recipes** — PDF or CSV export of personal recipe library.
- **Import recipes** — bulk import from CSV or other formats.
- **Brew calendar** — visual timeline of a user's brewing history.
- **Cupping scores** — SCA-standard cupping score sheets alongside personal notes.
