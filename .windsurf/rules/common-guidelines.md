---
trigger: always_on
---

<project_context>
BrewForm is a coffee recipe sharing platform built with:
- **Backend**: Hono + Node.js 24 + Prisma + PostgreSQL + Redis
- **Frontend**: React 18 + BaseUI + Styletron + SWR + React Router v7
- **Tooling**: pnpm workspaces + Turborepo + Biome.js + Vitest + Docker
</project_context>

<coding_standards>
- Use TypeScript with strict types; avoid `any`
- Follow existing code style and Biome configuration
- Prefer early returns over nested conditions
- Use meaningful variable/function names
- Keep functions small and focused
- Use async/await for asynchronous operations
</coding_standards>

<docker_commands>
**CRITICAL**: Run all commands through Docker/Makefile, never directly on host:
```bash
make dev          # Start development
make db-migrate   # Run migrations
make db-studio    # Open Prisma Studio
make shell-api    # API container shell
make shell-web    # Web container shell
```
</docker_commands>

<security>
- Never hardcode secrets; use environment variables
- Validate all inputs with Zod
- Use parameterized queries (Prisma handles this)
</security>
