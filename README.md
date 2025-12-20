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
- **Runtime**: Node.js 24
- **Framework**: [Hono](https://hono.dev/) - Fast, lightweight web framework
- **Database**: PostgreSQL with [Prisma ORM](https://prisma.io/)
- **Caching**: Redis for sessions and rate limiting
- **Validation**: [Zod](https://zod.dev/) for runtime type validation
- **Authentication**: JWT with refresh tokens
- **Email**: Nodemailer with MJML templates
- **Logging**: [Pino](https://getpino.io/) for structured JSON logging

### Frontend
- **Framework**: React 18
- **UI Library**: [BaseUI](https://baseweb.design/) by Uber
- **Styling**: Styletron CSS-in-JS
- **State**: SWR for data fetching, React Context for auth/theme
- **i18n**: react-i18next
- **Routing**: React Router v7

### DevOps
- **Monorepo**: Turborepo with pnpm workspaces
- **Linting**: Biome.js
- **Testing**: Vitest
- **Containerization**: Docker with multi-stage builds

## Getting Started

### Prerequisites

- Node.js 24+
- pnpm 9+
- Docker and Docker Compose

### Quick Start with Docker

```bash
# Clone the repository
git clone https://github.com/yourusername/brewform.git
cd brewform

# Copy environment file
cp .env.example .env

# Start all services
make up

# Run database migrations and seed
make db-migrate
make db-seed
```

### Local Development

```bash
# Install dependencies
pnpm install

# Generate Prisma client
pnpm db:generate

# Start development servers
pnpm dev
```

### Available Commands

```bash
# Development
make dev          # Start dev environment
make logs         # View logs
make stop         # Stop services

# Database
make db-migrate   # Run migrations
make db-seed      # Seed database
make db-studio    # Open Prisma Studio

# Testing & Linting
make test         # Run tests
make lint         # Lint code
make lint-fix     # Fix lint issues

# Cleanup
make clean        # Remove containers and volumes
```

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
├── Makefile                 # Development commands
└── turbo.json               # Turborepo configuration
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
- **Admin**: Audit logs, rate limits

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see LICENSE file for details.

---

Made with ☕ by Arda Kilicdagi, while drinking Americano and thinking about coffee. ☕☕☕
