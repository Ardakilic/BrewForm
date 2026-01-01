---
trigger: glob
globs:
  - "**/Dockerfile*"
  - "**/docker-compose*.yml"
  - "**/Makefile"
  - "**/.env*"
  - "**/nginx.conf"
---

<critical_rule>
**All commands MUST be executed through Docker Compose or Makefile.**
Never run pnpm/npx commands directly on the host system.
</critical_rule>

<development_commands>
```bash
make dev          # Start development environment
make logs         # View all container logs
make logs-api     # View API logs only
make logs-web     # View web logs only
make stop         # Stop all services
```
</development_commands>

<database_commands>
```bash
make db-migrate   # Run migrations
make db-seed      # Seed database
make db-studio    # Open Prisma Studio
make db-generate  # Generate Prisma client
make db-reset     # Reset database (destructive)
```
</database_commands>

<shell_access>
```bash
make shell-api    # Shell in API container
make shell-web    # Shell in web container
make shell-db     # PostgreSQL shell
make shell-redis  # Redis CLI
```
</shell_access>

<production_commands>
```bash
make prod-build   # Build production images
make prod-start   # Start production services
make prod-logs    # View production logs
make prod-stop    # Stop production services
```
</production_commands>

<services>
| Service  | Dev Port | Description                    |
|----------|----------|--------------------------------|
| postgres | 5432     | PostgreSQL 18                  |
| redis    | 6379     | Redis 7                        |
| api      | 3001     | Hono backend                   |
| web      | 3000     | React frontend                 |
| mailpit  | 8025     | Email testing UI               |
| pgadmin  | 8080     | Database admin                 |
</services>

<docker_best_practices>
- Use multi-stage builds for optimization
- Run containers as non-root in production
- Implement health checks for all services
- Use specific image tags (not latest)
- Use .dockerignore to optimize context
</docker_best_practices>

<environment>
- Never commit secrets to version control
- Use .env.example as template
- Database/Redis URLs must use container names in Docker
</environment>
