# Architecture

## Soft deletes

Queries use `findFirst({ where: eq(table.deletedAt, null) })`.
Current code uses `and(eq(t.id, id), isNull(t.deletedAt))`.
