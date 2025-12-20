# Contributing to BrewForm

Thank you for your interest in contributing to BrewForm! This document provides guidelines and instructions for contributing.

## Code of Conduct

Please be respectful and constructive in all interactions. We're all here to build something great together.

## Getting Started

### Prerequisites

- Node.js 24+
- pnpm 9+
- Docker and Docker Compose
- Git

### Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/yourusername/brewform.git
   cd brewform
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up environment**
   ```bash
   cp .env.example .env
   # Edit .env with your local settings
   ```

4. **Start development services**
   ```bash
   make dev
   ```

5. **Run database migrations**
   ```bash
   make db-migrate
   make db-seed
   ```

## Development Workflow

### Branch Naming

- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation updates
- `refactor/description` - Code refactoring
- `test/description` - Test additions or fixes

### Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `style` - Formatting, missing semicolons, etc.
- `refactor` - Code refactoring
- `test` - Adding tests
- `chore` - Maintenance tasks

Examples:
```
feat(recipes): add recipe versioning
fix(auth): resolve token refresh race condition
docs(readme): update installation instructions
```

### Pull Request Process

1. Create a feature branch from `develop`
2. Make your changes
3. Ensure all tests pass: `pnpm test`
4. Ensure linting passes: `pnpm lint`
5. Update documentation if needed
6. Submit a PR to `develop`

### Code Style

- We use [Biome](https://biomejs.dev/) for linting and formatting
- Run `pnpm lint` to check for issues
- Run `pnpm lint:fix` to auto-fix issues
- Follow existing code patterns and conventions

### Testing

- Write tests for new features
- Maintain 85%+ code coverage
- Run tests with `pnpm test`
- Run coverage with `pnpm test:coverage`

## Project Structure

```
brewform/
├── apps/
│   ├── api/          # Backend Hono API
│   └── web/          # Frontend React app
├── packages/         # Shared packages (future)
├── .github/          # GitHub workflows
└── docs/             # Documentation
```

### API Development

The API uses:
- **Hono** - Web framework
- **Prisma** - Database ORM
- **Zod** - Validation
- **Pino** - Logging

Key directories:
- `apps/api/src/modules/` - Feature modules
- `apps/api/src/middleware/` - Express middleware
- `apps/api/src/utils/` - Shared utilities
- `apps/api/prisma/` - Database schema and migrations

### Web Development

The web app uses:
- **React** - UI framework
- **BaseUI** - Component library
- **React Router** - Routing
- **SWR** - Data fetching
- **i18next** - Internationalization

Key directories:
- `apps/web/src/pages/` - Route pages
- `apps/web/src/components/` - Shared components
- `apps/web/src/contexts/` - React contexts
- `apps/web/src/utils/` - Utilities

## Database Changes

1. Modify `apps/api/prisma/schema.prisma`
2. Create a migration: `pnpm --filter @brewform/api db:migrate:dev --name your_migration_name`
3. Generate client: `pnpm --filter @brewform/api db:generate`

## Adding New Features

1. **Backend**: Create a new module in `apps/api/src/modules/`
2. **Frontend**: Create pages in `apps/web/src/pages/`
3. **Tests**: Add tests for both backend and frontend
4. **Documentation**: Update README and API docs

## Questions?

- Open a [GitHub Issue](https://github.com/yourusername/brewform/issues)
- Join our community discussions

Thank you for contributing! ☕
