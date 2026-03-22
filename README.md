# BrewForm ☕

> Share and discover coffee brewing recipes. Track your espresso, pour-over, and specialty coffee dive-ins.

## Features

- **Recipe Management**: Create, version, and share coffee recipes with detailed brewing parameters
- **Equipment Tracking**: Log your grinders, brewers, and accessories
- **Coffee Beans**: Track roasters, origins, processing methods, and flavor notes
- **Social Features**: Favourite recipes, comments, and recipe comparisons
- **Versioning**: Track recipe iterations and fork others' recipes
- **Unit Conversion**: Store in metric, display in user's preferred units
- **Themes**: Light, Dark, and Coffee themes

## Tech Stack

### Backend
- **Runtime**: [Deno 2](https://deno.com/) — native TypeScript, no build step
- **Framework**: [Hono](https://hono.dev/) - Fast, lightweight web framework
- **Database**: PostgreSQL with [Prisma ORM](https://prisma.io/)
- **Caching**: Redis for sessions and rate limiting
- **Validation**: [Zod](https://zod.dev/) for runtime type validation
- **Authentication**: JWT with refresh tokens
- **Email**: Nodemailer with MJML templates
- **Logging**: [Pino](https://getpino.io/) for structured JSON logging

### Frontend
- **Runtime**: [Deno 2](https://deno.com/) for build tooling
- **Framework**: React 19
- **UI Library**: [BaseUI](https://baseweb.design/) by Uber
- **Styling**: Styletron CSS-in-JS
- **State**: SWR for data fetching, React Context for auth/theme
- **i18n**: react-i18next
- **Routing**: React Router v7

### DevOps
- **Monorepo**: Deno tasks per app (`deno.json`)
- **Linting**: Biome.js
- **Testing**: Vitest
- **Containerization**: Docker with multi-stage builds (`denoland/deno:debian-2.7.7`)

## Getting Started

### Prerequisites

- Docker and Docker Compose
- Make (optional, for convenient commands)

> **No local runtime required.** All commands run inside Docker containers via `make`. Deno is only needed locally if you want to run tasks outside Docker.

### Quick Start with Docker

```bash
# Clone the repository
git clone https://github.com/yourusername/brewform.git
cd brewform

# Copy environment file
cp .env.example .env

# Install dependencies (creates node_modules on host for IDE type-checking)
make install

# Start all services
make up

# Run database migrations and seed
make db-migrate
make db-seed
```

**Access the services:**
- Frontend: http://localhost:3000
- API: http://localhost:3001
- PgAdmin: http://localhost:8080 (pre-configured with PostgreSQL connection)
- Mailpit: http://localhost:8025
- Redis: localhost:6379

### Local Development

```bash
# Install dependencies (populates node_modules on host for IDE)
make install

# Generate Prisma client inside the API container
make db-generate

# Start development servers with live reload
make dev
```

### Available Commands

```bash
# Development
make up           # Start all services in detached mode
make dev          # Start dev environment with logs
make build        # Build all applications
make rebuild      # Rebuild and restart all services
make logs         # View logs
make stop         # Stop services

# Database
make db-generate  # Generate Prisma client
make db-migrate   # Run migrations
make db-seed      # Seed database
make db-seed-taste-notes  # Seed taste notes from SCAA JSON
make db-studio    # Open Prisma Studio
make db-reset     # Reset database (keeps schema)
make db-reset-hard # Complete reset: drops DB, runs migrations and seeds

# Testing & Linting
make test         # Run tests
make lint         # Lint code
make lint-fix     # Fix lint issues

# Cleanup
make clean        # Remove containers and volumes
```

## Troubleshooting

### API container fails to start with Prisma errors

If you see errors like `The requested module '@prisma/client' does not provide an export named 'BrewMethodType'`, the Prisma client is outdated. This can happen after schema changes.

```bash
# Regenerate the Prisma client
make db-generate

# Or rebuild the API container from scratch
docker compose build api
```

### Database Reset

For a complete database reset (use with caution - all data will be lost):

```bash
# Soft reset: keeps the schema but removes all data
make db-reset

# Hard reset: completely drops and recreates the database, then runs all migrations and seeds
make db-reset-hard
```

The `db-reset-hard` command is useful when:
- You want a fresh start with all migrations applied from scratch
- The database schema is corrupted or out of sync
- You need to test the full migration and seeding process

### Reset User Password

To reset a user's password (e.g., if you forgot the admin password):

```bash
# Reset password and generate a new random password
make reset-password USER=admin@brewform.local

# Reset password with a specific new password
make reset-password USER=admin@brewform.local PASSWORD=MySecurePassword123!

# You can also use username instead of email
make reset-password USER=admin PASSWORD=NewPassword123!
```

**Example: Resetting Admin Password**

If you forgot the admin password after seeding, run:

```bash
make reset-password USER=admin@brewform.local
```

Output:
```
🔐 Password reset successful!

User details:
   Email:    admin@brewform.local
   Username: admin
   Display:  Admin
   Admin:    Yes

New password (generated):
   xK#9mNpQ2vR$bT5w

⚠️  Please save this password - it will not be shown again!

ℹ️  All existing sessions have been invalidated.
   The user will need to log in again.
```

**Notes:**
- All existing sessions are invalidated after password reset
- If no password is provided, a secure 16-character password is generated
- Password must be at least 8 characters if provided manually

## Project Structure

```
brewform/
├── apps/
│   ├── api/                 # Hono backend
│   │   ├── prisma/          # Database schema and migrations
│   │   └── src/
│   │       ├── config/      # Environment configuration
│   │       ├── middleware/  # Auth, rate limiting, logging
│   │       ├── modules/     # Feature modules (auth, recipe, user, social)
│   │       └── utils/       # Shared utilities
│   └── web/                 # React frontend
│       └── src/
│           ├── components/  # Shared UI components
│           ├── contexts/    # React contexts (auth, theme)
│           ├── hooks/       # Custom hooks
│           ├── pages/       # Route pages
│           └── utils/       # Frontend utilities
├── docker-compose.yml       # Development Docker setup
├── docker-compose.prod.yml  # Production overrides
├── deno.json                # Root Deno config
├── Makefile                 # Development commands
└── docs/
    └── updates/             # Changelog / migration notes
```

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/logout` - Logout
- `POST /api/v1/auth/refresh` - Refresh tokens
- `POST /api/v1/auth/forgot-password` - Request password reset
- `POST /api/v1/auth/reset-password` - Reset password
- `POST /api/v1/auth/verify-email` - Verify email

### Recipes
- `GET /api/v1/recipes` - List recipes
- `POST /api/v1/recipes` - Create recipe
- `GET /api/v1/recipes/:id` - Get recipe
- `PATCH /api/v1/recipes/:id` - Update recipe metadata
- `DELETE /api/v1/recipes/:id` - Delete recipe
- `POST /api/v1/recipes/:id/versions` - Create new version
- `POST /api/v1/recipes/:id/fork` - Fork recipe

### Users
- `GET /api/v1/users/me` - Get current user
- `PATCH /api/v1/users/me` - Update profile
- `GET /api/v1/users/:username` - Get public profile

### Social
- `POST /api/v1/social/favourites/:recipeId` - Favourite recipe
- `DELETE /api/v1/social/favourites/:recipeId` - Unfavourite
- `GET /api/v1/social/recipes/:recipeId/comments` - Get comments
- `POST /api/v1/social/recipes/:recipeId/comments` - Add comment
- `POST /api/v1/social/comparisons` - Create comparison

### Taste Notes
- `GET /api/v1/taste-notes` - List all taste notes
- `GET /api/v1/taste-notes/hierarchy` - Get hierarchical structure
- `GET /api/v1/taste-notes/search?q=` - Search taste notes (min 3 chars)
- `GET /api/v1/taste-notes/:id` - Get single taste note

### Health
- `GET /health` - Basic health check
- `GET /health/ready` - Readiness probe
- `GET /health/live` - Liveness probe

## Environment Variables

See `.env.example` for all required environment variables.

Key variables:
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `JWT_SECRET` - Secret for JWT signing
- `SMTP_*` - Email configuration

## Database Schema

The database includes:
- **Users**: Authentication, profiles, preferences
- **Recipes**: With versioning and forking
- **Equipment**: Grinders, brewers, portafilters, baskets, etc.
- **Coffees & Vendors**: With origin and processing details
- **Social**: Favourites, comments, comparisons
- **Taste Notes**: Hierarchical SCAA 2016 flavor wheel (110 notes, 3 levels deep)
- **Admin**: Audit logs, rate limits

### Taste Notes

Taste notes are pre-populated from the [SCAA 2016 Coffee Flavor Wheel](https://notbadcoffee.com/flavor-wheel-en/). The data is included in the database migrations, so no additional seeding is required for most users.

If you need to re-seed taste notes from the JSON source file:
```bash
make db-seed-taste-notes
```

The taste notes are cached in Redis (24h TTL) for performance. Admin panel includes cache invalidation when notes are modified.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Support Development

This project is actively developed using [Windsurf](https://windsurf.com), an AI-powered IDE that accelerates development.

**Want to support BrewForm?** Sign up for Windsurf using our referral link:

👉 **[Get Windsurf + 250 Bonus Credits](https://windsurf.com/refer?referral_code=0axr8brh72htjihx)**

When you sign up through this link, both you and the project maintainer receive **250 bonus credits**. These credits are directly used to develop and improve BrewForm - helping us add new features, fix bugs, and make your coffee brewing experience even better!

## License

MIT License - see LICENSE file for details.

---

Made with ☕ by Arda Kilicdagi, while drinking Americano and thinking about coffee. ☕☕☕
