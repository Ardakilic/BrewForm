# BrewForm documentation

This folder holds the current documentation. Start with [architecture.md](architecture.md) for
the big picture, then follow the topic you need. Project-wide rules for contributors and agents
live in [`AGENTS.md`](../AGENTS.md); the backlog and status table live in
[`plans/ROADMAP.md`](../plans/ROADMAP.md).

## Architecture and conventions

| Document | What it covers |
| -------- | -------------- |
| [architecture.md](architecture.md) | Monorepo layout, API module pattern, cache, database rules, middleware, OpenAPI, web data flow, testing, code style |
| [request-lifecycle.md](request-lifecycle.md) | End-to-end trace of an HTTP request through the API |
| [decisions.md](decisions.md) | Architectural decision records (ADR index at the top) |
| [logging.md](logging.md) | Structured logging rules, request ids, what never gets logged |

## API

| Document | What it covers |
| -------- | -------------- |
| [api.md](api.md) | Conventions: base URL, envelopes, error codes, authentication, pagination, search, rate limits, request limits, visibility, partial updates |
| [api-reference.md](api-reference.md) | Every route, generated from the OpenAPI metadata (`pnpm --filter @brewform/api run docs:api`; do not edit by hand) |

## Features

| Document | What it covers |
| -------- | -------------- |
| [auth.md](auth.md) | Registration, login, tokens, email verification, password reset |
| [recipes.md](recipes.md) | Recipe versioning, forking, validation, slugs, personal notes, visibility |
| [comments.md](comments.md) | Comment threads, OP-only replies, @mentions, moderation |
| [notifications.md](notifications.md) | In-app and email notifications, preferences, adding a notification type |
| [seo.md](seo.md) | Meta tags, sitemap, robots, social previews, noindex rules |
| [taste-notes.md](taste-notes.md) | SCAA Flavor Wheel taste notes and autocomplete |
| [coffee-data.md](coffee-data.md) | Coffee varieties and the equipment catalog data |
| [coffee-equipments.md](coffee-equipments.md) | Equipment catalog reference |

## Development and deployment

| Document | What it covers |
| -------- | -------------- |
| [docker.md](docker.md) | Docker development environment, volume strategy, troubleshooting |
| [deployment_compose.md](deployment_compose.md) | Self-hosting with Docker Compose (`compose.production.yml`, `make prod-*`) |
| [deployment_coolify.md](deployment_coolify.md) | Self-hosting on Coolify (as-built) |
| [`coolify_deployment_plan.md`](../coolify_deployment_plan.md) | Long-form Coolify deployment plan |

## History

[`history/`](history/) keeps superseded documents for reference. They describe the project as it
was when they were written, carry a "Historical snapshot … superseded" banner, and are not
updated. Do not use them as guides or work lists.

| Document | Superseded by |
| -------- | ------------- |
| [history/2026-10-11-serverless-deployment.md](history/2026-10-11-serverless-deployment.md) | [deployment_compose.md](deployment_compose.md) and [deployment_coolify.md](deployment_coolify.md) |
| [history/2026-05-03-requirements-audit-report.md](history/2026-05-03-requirements-audit-report.md) | [`plans/ROADMAP.md`](../plans/ROADMAP.md) |

When a document is retired, `git mv` it to `history/<YYYY-MM-DD>-<name>.md`, add the banner, fix
inbound links and add a row here.
