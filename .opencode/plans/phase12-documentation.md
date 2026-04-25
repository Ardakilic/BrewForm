# BrewForm Phase 12 — Documentation

## Status: READY

## Overview

Create comprehensive project documentation: feature docs, API docs, and a polished README.

---

## File Inventory

### 1. `README.md` — UPDATE (replace existing)

```markdown
# ☕ BrewForm

A web application for digitalizing, sharing, and discovering coffee brewing recipes and tasting notes.

## Features

- **Recipe Management** — Create, version, and fork coffee brewing recipes with full parameter tracking
- **SCAA Taste Notes** — Structured tasting notes from the SCAA 2016 Flavor Wheel with autocomplete
- **Brew Method Compatibility** — Data-driven validation ensures brew methods and equipment are compatible
- **Social Features** — Follow brewers, like/favourite recipes, comment with OP-only replies
- **Achievement Badges** — Gamification system with data-driven badge rules
- **QR Codes** — Generate shareable QR codes for public recipes
- **Three Themes** — Light, Dark, and Coffee mode
- **Canonical Units** — All data stored in metric; UI converts to preferences
- **Version Control** — Each recipe edit creates an immutable snapshot; full history browsable
- **Onboarding Wizard** — Guided setup for new users

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Deno |
| Monorepo | Turborepo (npm workspaces) |
| Backend | Hono |
| Frontend | React + Vite + Tailwind CSS + Base UI |
| ORM | Prisma |
| Database | PostgreSQL |
| Cache | Deno KV |
| Email | MJML |
| Validation | Zod (shared between frontend and backend) |
| Testing | Deno test runner + BDD (`@std/testing/bdd`) |
| CI/CD | GitHub Actions → Deno Deploy + GitHub Pages |

## Quick Start

All commands run through Docker. No local Deno/Node installation required.

```bash
# Clone the repository
git clone https://github.com/your-org/brewform.git
cd brewform

# Copy environment config
cp .env.example .env

# Start all services
make up

# Install dependencies
make install

# Generate Prisma client
make db-generate

# Run database migrations
make db-migrate

# Seed the database
make db-seed

# Start development server
make dev
```

## Development

```bash
make dev          # Start development (API + web)
make dev-api      # Start API with hot reload only
make lint         # Lint the codebase
make fmt          # Format the codebase
make fmt-check    # Check formatting
make check        # Type check all workspaces
make test         # Run all tests
make test-coverage # Run tests with coverage
make ci           # Full CI check (fmt-check, lint, check, test-coverage)
```

## Database

```bash
make db-migrate   # Apply migrations
make db-seed      # Seed sample data
make db-studio    # Open Prisma Studio
make db-reset     # Reset database (destroys data)
```

## Architecture

```
apps/web ──────→ packages/shared
                       ↑
apps/api ──┬──→ packages/shared
           └──→ packages/db ──→ packages/shared
```

- **`apps/api/`** — Hono backend API (Deno Deploy)
- **`apps/web/`** — React SPA frontend (GitHub Pages)
- **`packages/shared/`** — Types, Zod schemas, constants, utils, i18n
- **`packages/db/`** — Prisma schema, migrations, seed data, client

## Project Structure

```
brewform/
├── apps/
│   ├── api/                  # Hono backend
│   │   └── src/
│   │       ├── main.ts
│   │       ├── config/
│   │       ├── middleware/
│   │       ├── modules/      # Auth, Recipe, User, etc.
│   │       ├── routes/
│   │       ├── utils/
│   │       └── templates/
│   └── web/                  # React frontend
│       └── src/
│           ├── pages/
│           ├── components/
│           ├── contexts/
│           ├── api/
│           └── styles/
├── packages/
│   ├── shared/               # Types, schemas, constants, utils, i18n
│   └── db/                   # Prisma schema, migrations, seed
├── files/
│   └── scaa-2.json           # SCAA flavor wheel data
├── docs/                     # Feature documentation
├── docker-compose.yml
├── Dockerfile
├── Makefile
├── turbo.json
└── deno.json
```

## API

The API is versioned at `/api/v1/`. See [docs/api.md](docs/api.md) for the full endpoint reference.

## License

See [LICENSE](LICENSE) for details.
```

### 2. `docs/api.md`

Complete API endpoint reference:

```markdown
# BrewForm API Reference

Base URL: `/api/v1`

## Authentication

All authenticated endpoints require a `Authorization: Bearer <token>` header.

### POST /auth/register
Create a new account.

**Request:**
```json
{
  "email": "user@example.com",
  "username": "brewmaster",
  "password": "securepassword",
  "displayName": "Brew Master"
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "data": {
    "user": { "id": "...", "email": "...", "username": "..." },
    "accessToken": "...",
    "refreshToken": "..."
  }
}
```

### POST /auth/login
Authenticate and receive tokens.

### POST /auth/refresh
Exchange a refresh token for new access + refresh tokens.

### POST /auth/forgot-password
Request a password reset email.

### POST /auth/reset-password
Confirm password reset with token.

---

## Users

### GET /users/me
Get current user's profile. (Auth required)

### PATCH /users/me
Update current user's profile. (Auth required)

### DELETE /users/me
Soft-delete current user's account. (Auth required)

### GET /users/:username
Get a user's public profile.

---

## Recipes

### GET /recipes
List public recipes with pagination and filters.

**Query Parameters:**
- `page` (default 1)
- `perPage` (default 20, max 100)
- `brewMethod` — filter by brew method
- `drinkType` — filter by drink type
- `visibility` — filter by visibility (only own recipes when non-public)
- `authorId` — filter by author
- `search` — search by title
- `sortBy` — `createdAt` | `likeCount` | `rating`
- `sortOrder` — `asc` | `desc`

### GET /recipes/:slugOrId
Get a single recipe by slug or ID. Private/draft recipes only visible to author.

### POST /recipes
Create a new recipe. (Auth required)

### PATCH /recipes/:id
Update a recipe. (Auth required, author only). Set `bumpVersion: true` to create a new immutable version.

### DELETE /recipes/:id
Soft-delete a recipe. (Auth required, author only)

### POST /recipes/:id/fork
Fork a public/unlisted recipe. (Auth required)

### GET /recipes/compare/:id1/:id2
Compare two public recipes side-by-side.

---

## Taste Notes

### GET /taste-notes/hierarchy
Get the full taste note hierarchy tree (cached in Deno KV).

### GET /taste-notes/flat
Get all taste notes as a flat list.

### GET /taste-notes/search?search=query
Search taste notes (minimum 3 characters). Results include parent expansions.

### POST /taste-notes
Create a taste note. (Admin only)

### PATCH /taste-notes/:id
Update a taste note. (Admin only — flushes cache)

### DELETE /taste-notes/:id
Delete a taste note. (Admin only — flushes cache)

---

## Equipment

### GET /equipment
List equipment (paginated, filterable by type).

### GET /equipment/search?q=query
Autocomplete search for equipment.

### POST /equipment
Create equipment. (Auth required)

---

## Beans

### GET /beans
List current user's beans. (Auth required)

### POST /beans
Add a bean. (Auth required)

### PATCH /beans/:id
Update a bean. (Auth required, owner only)

### DELETE /beans/:id
Delete a bean. (Auth required, owner only)

---

## Vendors

### GET /vendors
List vendors (paginated).

### GET /vendors/search?q=query
Autocomplete search for vendors.

---

## Comments

### GET /comments/recipe/:recipeId
List comments for a recipe (paginated).

### POST /comments/recipe/:recipeId
Add a comment. (Auth required)

### POST /comments/:commentId/reply
Reply to a comment. (Auth required, recipe author only per §3.4)

---

## Follow

### POST /follow/:userId
Follow a user. (Auth required)

### DELETE /follow/:userId
Unfollow a user. (Auth required)

### GET /follow/:userId/followers
List a user's followers.

### GET /follow/:userId/following
List who a user is following.

### GET /follow/feed
Feed of recipes from followed users. (Auth required)

---

## Badges

### GET /badges
List all badge definitions.

### GET /badges/user/:userId
List a user's earned badges.

---

## Setups

### GET /setups
List current user's setups. (Auth required)

### POST /setups
Create a setup. (Auth required)

### PATCH /setups/:id
Update a setup. (Auth required, owner only)

### DELETE /setups/:id
Delete a setup. (Auth required, owner only)

---

## Preferences

### GET /preferences
Get current user's preferences. (Auth required)

### PATCH /preferences
Update current user's preferences. (Auth required)

---

## Search

### GET /search
Search recipes across multiple fields. Same parameters as GET /recipes.

---

## QR Code

### GET /qrcode/recipe/:slug.png
Generate a PNG QR code for a public/unlisted recipe.

### GET /qrcode/recipe/:slug.svg
Generate an SVG QR code for a public/unlisted recipe.

---

## Photos

### POST /photos
Upload a photo (multipart). (Auth required)

### GET /photos/recipe/:recipeId
List photos for a recipe.

### DELETE /photos/:id
Delete a photo. (Auth required, recipe owner only)

---

## Admin

All admin endpoints require authentication + admin role.

### GET /admin/users
List all users (paginated, searchable).

### POST /admin/users/:id/ban
Ban/unban a user.

### GET /admin/recipes
List all recipes (paginated).

### PATCH /admin/recipes/:id/visibility
Change a recipe's visibility.

### CRUD /admin/equipment
Manage equipment.

### CRUD /admin/vendors
Manage vendors.

### CRUD /admin/taste-notes
Manage taste notes (flushes cache on changes).

### CRUD /admin/compatibility
Manage brew method compatibility matrix.

### GET /admin/badges
List badge definitions.

### GET /admin/audit-log
View audit log (paginated, filterable by entity).

### POST /admin/cache/flush
Flush Deno KV cache.

---

## Response Format

All responses follow a consistent envelope:

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "requestId": "abc-123",
    "pagination": { "page": 1, "perPage": 20, "total": 142, "totalPages": 8 }
  }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Grind date cannot be earlier than roast date",
    "details": [{ "field": "grindDate", "message": "..." }],
    "requestId": "abc-123"
  }
}
```

## Error Codes

| Code | HTTP Status | Description |
|------|-----------|-------------|
| VALIDATION_ERROR | 400 | Request validation failed |
| UNAUTHORIZED | 401 | Authentication required |
| FORBIDDEN | 403 | Insufficient permissions |
| NOT_FOUND | 404 | Resource not found |
| CONFLICT | 409 | Duplicate resource |
| USER_BANNED | 403 | User account is banned |
| INVALID_CREDENTIALS | 401 | Wrong email or password |
| INVALID_REFRESH_TOKEN | 401 | Invalid or expired refresh token |
| INVALID_RESET_TOKEN | 400 | Invalid password reset token |
| TOKEN_EXPIRED | 400 | Reset token has expired |
| TOKEN_USED | 400 | Reset token already used |
| QUERY_TOO_SHORT | 400 | Taste note search query needs 3+ characters |
| INTERNAL_ERROR | 500 | Unexpected server error |
```

### 3. `docs/auth.md`

```markdown
# Authentication

BrewForm uses JWT-based authentication with access tokens and refresh tokens.

## Token Strategy

- **Access Token**: Short-lived (15 minutes), sent in `Authorization: Bearer <token>` header
- **Refresh Token**: Long-lived (7 days), stored in localStorage

## Login Flow

1. Client sends `POST /auth/login` with email + password
2. Server returns `{ accessToken, refreshToken }`
3. Client stores both tokens in localStorage
4. Client includes `Authorization: Bearer <accessToken>` on authenticated requests
5. When access token expires (401 response), client calls `POST /auth/refresh` with refreshToken
6. Server returns new `{ accessToken, refreshToken }`
7. Client updates stored tokens

## Password Reset

1. Client sends `POST /auth/forgot-password` with email
2. Server sends reset email (or silently ignores unknown emails)
3. User clicks reset link with token
4. Client sends `POST /auth/reset-password` with token + new password
5. Server validates token (not expired, not used) and updates password

## Logout

Client clears both tokens from localStorage. No server-side logout endpoint needed (stateless JWT).
```

### 4. `docs/recipes.md`

```markdown
# Recipes

## Creating a Recipe

A recipe has two layers:
- **Recipe** — mutable metadata (title, visibility, fork reference)
- **RecipeVersion** — immutable snapshot of all brewing parameters

When you create a recipe, version 1 is automatically created. When you edit with `bumpVersion: true`, a new immutable version is created.

## Versioning

- Each version has a monotonically increasing `versionNumber`
- Versions are **immutable** — once created, they cannot be modified
- The recipe's `currentVersionId` always points to the latest version
- Full version history is browsable

## Forking

- Any public/unlisted recipe can be forked
- The forked recipe links back to the original via `forkedFromId`
- The fork starts as a draft with all parameters copied from the source's latest version
- The forker can modify any parameters
- The original recipe's `forkCount` is incremented

## Visibility

| State | Description |
|-------|-----------|
| `draft` | Work in progress, only visible to author |
| `private` | Saved but only visible to author |
| `unlisted` | Accessible via direct link, not listed publicly |
| `public` | Visible to everyone, searchable, indexable |

## Validation

### Hard Validation (blocks save)
- Brew method and drink type must be compatible (per compatibility matrix)
- Grind date cannot be earlier than roast date
- Required fields must be present
- Numeric values must be physically valid (> 0)

### Soft Validation (warnings only)
- Espresso ratio outside typical range (< 1:1.5 or > 1:3)
- Extraction time unusually short/long for brew method
- Brew temperature outside common ranges

## Comparison

Two public recipes can be compared side-by-side via `GET /recipes/compare/:id1/:id2`. The comparison is shareable via URL. If either recipe becomes private/draft, the comparison becomes inaccessible.
```

### 5. `docs/taste-notes.md`

```markdown
# Taste Notes (SCAA Flavor Wheel)

## Data Source

The SCAA 2016 Flavor Wheel data is imported from `files/scaa-2.json` during database seeding. The data has a 3-level hierarchy:

- **Level 0** (Root): Fruity, Sweet, Spices, Roasted, etc.
- **Level 1** (Mid): Berry, Citrus Fruit, Brown Sugar, etc.
- **Level 2** (Leaf): Raspberry, Blackberry, Grapefruit, Honey, etc.

## Autocomplete

- Activates after 3+ characters
- 2-second debounce (cancels previous search on each keypress)
- Case-insensitive search across full breadcrumb path
- If a match hits a parent, show all its children
- Results sorted by depth then name

## Caching

- Taste notes rarely change
- Full taxonomy cached in Deno KV with 24-hour TTL
- Cache flushed when admin creates/updates/deletes a taste note

## API Endpoints

- `GET /taste-notes/hierarchy` — Full tree structure
- `GET /taste-notes/flat` — Flat list of all notes
- `GET /taste-notes/search?search=fruit` — Search with autocomplete rules
- `POST /taste-notes` — Create (admin only, flushes cache)
- `PATCH /taste-notes/:id` — Update (admin only, flushes cache)
- `DELETE /taste-notes/:id` — Delete (admin only, flushes cache)

## Example Search Results

Searching for `"fruit"`:
```
Fruity
Fruity > Berry
Fruity > Berry > Raspberry
Fruity > Berry > Blackberry
Fruity > Berry > Strawberry
Fruity > Citrus Fruit
Fruity > Citrus Fruit > Grapefruit
...
```
```

### 6. `docs/deployment.md`

```markdown
# Deployment

## Architecture

```
┌──────────────────┐       ┌──────────────────────────┐
│  GitHub Pages    │       │    Deno Deploy (free)     │
│  (Static SPA)    │──────▶│    Hono API + Prisma      │
│  React frontend  │ CORS  │    Deno KV (cache)        │
└──────────────────┘       │    PostgreSQL (managed)    │
                           └──────────────────────────┘
```

## Backend Deployment (Deno Deploy)

1. Push to `main` branch
2. GitHub Actions builds and deploys to Deno Deploy via `deployctl`
3. Environment variables configured in Deno Deploy dashboard
4. Entry point: `apps/api/src/main.ts`

## Frontend Deployment (GitHub Pages)

1. Push to `main` branch
2. GitHub Actions builds the React SPA with `VITE_API_URL` pointing to Deno Deploy
3. Built assets in `apps/web/dist/` deployed to GitHub Pages
4. SPA routing handled via `404.html` redirect trick

## Environment Variables

See `.env.example` for all configuration options. Production must override:
- `JWT_SECRET` — cryptographically random, at least 32 characters
- `CORS_ALLOWED_ORIGINS` — `https://brewform.github.io`
- `DATABASE_URL` — production PostgreSQL connection string
- `SMTP_*` — production email credentials
- `OPENAPI_ENABLED` — `false` in production

## Local Development

```bash
make up        # Start all services (postgres, mailpit, pgadmin, app)
make dev       # Start development server with hot reload
make logs      # View API logs
make db-seed   # Seed sample data
```

Admin credentials after seeding: `admin@brewform.local` / `admin123456`
```

### 7. `docs/architecture.md`

```markdown
# Architecture

## Monorepo Structure

BrewForm uses a Turborepo monorepo with npm workspaces. Three packages:

- **`apps/api`** — Hono backend API, deployed to Deno Deploy
- **`apps/web`** — React SPA frontend, deployed to GitHub Pages
- **`packages/shared`** — Types, Zod schemas, constants, utils, i18n (shared between api and web)
- **`packages/db`** — Prisma schema, migrations, seed data, client (api only)

## Dependency Graph

```
apps/web ──────→ packages/shared
                       ↑
apps/api ──┬──→ packages/shared
           └──→ packages/db ──→ packages/shared
```

The frontend **never** imports from `@brewform/db`.

## Module Pattern

Each backend module follows a 3-layer pattern:

- **`model.ts`** — Prisma wrapper (raw data access)
- **`service.ts`** — Business logic (validation, orchestration)
- **`index.ts`** — Controller (Hono routes, Zod validation, response formatting)

Services never import `@prisma/client` directly — they import from model files. This ensures database portability per §6.2.

## Cache Architecture

All caching goes through the `CacheProvider` interface — never `Deno.openKv()` directly. The current implementation is `DenoKVCacheProvider`. An `InMemoryCacheProvider` exists for testing. Services receive the cache instance via dependency injection.

## Validation

Zod schemas live in `@brewform/shared/schemas` and are shared between frontend and backend. Hard validation blocks saves; soft validation warns but allows saves.

## Portability Rules (§6.2)

- No raw SQL — all queries via Prisma Client
- No `@db.JsonB`, `@db.Uuid`, or Postgres-specific features
- No Postgres-specific query operators (like `mode: 'insensitive'`)
- All filterable fields reference normalized entities or enums
- Services import from model files, never from `@prisma/client`

## Database Pooling

Connection pooling configured via `DATABASE_URL` parameters:
```
DATABASE_URL=postgresql://user:pass@host:5432/brewform?connection_limit=10&pool_timeout=30
```
```

---

## Verification Steps

1. All documentation files exist in `docs/`
2. README.md provides clear quick-start, development, and architecture overview
3. API reference covers all endpoints with request/response examples
4. Feature docs (auth, recipes, taste-notes, deployment, architecture) are comprehensive
5. No broken internal links between documents