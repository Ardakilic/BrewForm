---
trigger: auto
category: rules
---

This rule governs all infrastructure-related operations, Docker usage, and deployment practices for the BrewForm coffee recipe platform.

## Technology Stack & Libraries

### Core Infrastructure
- **Container Runtime**: Docker with multi-stage builds
- **Orchestration**: Docker Compose (development & production)
- **Node.js Runtime**: Node.js 24 LTS on Debian Trixie Slim
- **Package Manager**: pnpm 9.15.0 with workspaces
- **Monorepo**: Turborepo for build orchestration

### Backend Stack
- **Framework**: Hono (fast, lightweight web framework)
- **Database**: PostgreSQL 18 with Prisma ORM
- **Cache**: Redis 7 for sessions and rate limiting
- **Validation**: Zod for runtime type validation
- **Authentication**: JWT with refresh tokens
- **Email**: Nodemailer with MJML templates
- **Logging**: Pino for structured JSON logging

### Frontend Stack
- **Framework**: React 18
- **UI Library**: BaseUI by Uber
- **Styling**: Styletron CSS-in-JS
- **State Management**: SWR for data fetching, React Context
- **Routing**: React Router v7
- **Internationalization**: react-i18next

### DevOps & Tooling
- **Linting**: Biome.js (fast linter/formatter)
- **Testing**: Vitest
- **Web Server**: Nginx (production frontend serving)
- **Email Testing**: Mailpit for development
- **Database Admin**: PgAdmin for development

## Docker and Application Commands Usage

**CRITICAL**: All infrastructure and application commands MUST be executed through Docker Compose or the Makefile wrapper. Never run pnpm/npx commands directly on the host system.

### Development Workflow
```bash
# Start development environment
make dev                    # Starts all services in development mode
make logs                   # View all container logs
make logs-api              # View API container logs only
make logs-web              # View web container logs only

# Database operations
make db-migrate            # Run database migrations
make db-seed               # Seed database with sample data
make db-studio             # Open Prisma Studio
make db-generate           # Generate Prisma client
make db-reset              # Reset database (destructive)

# Shell access
make shell-api             # Open shell in API container
make shell-web             # Open shell in web container
make shell-db              # Open psql shell
make shell-redis           # Open Redis CLI
```

### Production Workflow
```bash
# Production deployment
make prod-build            # Build production images
make prod-start            # Start production services
make prod-logs             # View production logs
make prod-stop             # Stop production services
```

### Service Architecture

#### Development Services
- **postgres**: PostgreSQL 18 on port 5432
- **redis**: Redis 7 on port 6379
- **mailpit**: Email testing on ports 1025 (SMTP) and 8025 (Web UI)
- **pgadmin**: Database admin on port 8080
- **api**: Hono backend on port 3001
- **web**: React frontend on port 3000

#### Production Services
- **api**: Production-optimized Hono container
- **web**: Nginx serving static React build
- **postgres**: PostgreSQL with production settings
- **redis**: Redis with production settings

## Infrastructure Guidelines

### Docker Best Practices
- Always use multi-stage builds for optimization
- Run containers as non-root users in production
- Implement health checks for all services
- Use Docker volumes for persistent data
- Set appropriate restart policies
- Use .dockerignore files to optimize build context

### Environment Configuration
- Never commit secrets to version control
- Use .env.example as template for environment variables
- All sensitive data must be in environment variables
- Database and Redis URLs must use container names in Docker

### Database Management
- All database operations must go through Prisma
- Migrations should be generated in API container
- Use Prisma Studio for database inspection
- Never manually modify database schema

### Security Considerations
- Use specific image tags (not latest) in production
- Implement proper CORS and security headers
- Use rate limiting on API endpoints
- Enable HTTPS in production environments
- Regular security updates for base images

### Performance Optimization
- Enable gzip compression in Nginx
- Use Redis for caching frequently accessed data
- Implement proper database indexing
- Use connection pooling for database connections
- Optimize Docker image sizes with multi-stage builds

### Monitoring & Logging
- Use structured JSON logging with Pino
- Implement health check endpoints
- Monitor container resource usage
- Set up log aggregation for production
- Use appropriate log levels (debug, info, warn, error)

### Development Environment Setup
- Always use `make setup` for initial project setup
- Copy .env.example to .env before starting
- Use `make install` to install dependencies in containers
- Start services in correct order (postgres, redis before api/web)

### Production Deployment
- Use production Docker Compose overrides
- Enable all security features
- Set proper resource limits
- Configure backup strategies for database
- Use environment-specific configurations

## Common Infrastructure Tasks

When working with infrastructure, always:
1. Use Docker Compose commands through Makefile
2. Check container health before proceeding
3. Verify service dependencies are met
4. Use appropriate environment configurations
5. Follow the principle of infrastructure as code
6. Document any infrastructure changes
7. Test infrastructure changes in development first

## Troubleshooting

For infrastructure issues:
1. Check container logs with `make logs`
2. Verify all services are healthy
3. Check network connectivity between containers
4. Verify environment variables are correctly set
5. Ensure database migrations are applied
6. Check for port conflicts on the host system
