---
trigger: glob
globs: 
  - "**/prisma/**"
  - "**/*.prisma"
---

<schema_conventions>
- Model names: PascalCase (User, Recipe, CoffeeBean)
- Field names: snake_case (created_at, user_id)
- Include timestamps: `created_at` and `updated_at`
- Use `@default(now())` and `@updatedAt` for timestamps
</schema_conventions>

<field_types>
- String with `@db.VarChar(n)` for limited text
- DateTime with `@db.Timestamptz` for timestamps
- Use `@unique` for natural keys
- Use `@default(cuid())` for IDs
</field_types>

<relationships>
- Define foreign keys explicitly with `@relation`
- Use `onDelete: Cascade` carefully
- Add `@@index` on foreign keys
- Use junction tables for many-to-many
</relationships>

<migrations>
```bash
# Always run in Docker container
make db-generate    # Generate Prisma client
make db-migrate     # Apply migrations
make db-studio      # Inspect database
make db-reset       # Reset (dev only)
```
- Create descriptive migration names
- Review migrations before applying
- Never modify existing migration files
- Use `prisma migrate dev` for development
</migrations>

<query_patterns>
- Use `include` and `select` for efficient queries
- Implement pagination with `skip` and `take`
- Use transactions for consistency
- Add indexes on frequently queried fields
</query_patterns>

<security>
- Hash passwords (never store plain text)
- Implement row-level security patterns
- Validate user ownership in queries
- Use soft deletes for audit trails
</security>
