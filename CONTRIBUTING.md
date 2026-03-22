# Contributing to BrewForm

Thank you for your interest in contributing to BrewForm! This document provides guidelines and instructions for contributing.

## Code of Conduct

Please be respectful and constructive in all interactions. We're all here to build something great together.

## Getting Started

### Prerequisites

- Docker and Docker Compose
- Git
- Deno 2.7.7+ (optional, for running tasks outside Docker)

### Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/Ardakilic/BrewForm.git
   cd BrewForm
   ```

2. **Install dependencies**
   ```bash
   make install
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
3. Ensure all tests pass: `make test`
4. Ensure linting passes: `make lint`
5. Update documentation if needed
6. Submit a PR to `develop`

### Code Style

- We use [Biome](https://biomejs.dev/) for linting and formatting
- Run `make lint` to check for issues
- Run `make lint:fix` to auto-fix issues
- Follow existing code patterns and conventions

### Testing

- Write tests for new features
- Maintain 85%+ code coverage
- Run tests with `make test`
- Run coverage with `make test:coverage`

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
2. Create a migration: `make db-migrate-dev NAME=your_migration_name`
3. Generate client: `make db-generate`

## Adding New Features

1. **Backend**: Create a new module in `apps/api/src/modules/`
2. **Frontend**: Create pages in `apps/web/src/pages/`
3. **Tests**: Add tests for both backend and frontend
4. **Documentation**: Update README and API docs

## Questions?

- Open a [GitHub Issue](https://github.com/Ardakilic/BrewForm/issues)
- Join our community discussions

Thank you for contributing! ☕
