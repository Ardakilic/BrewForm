---
trigger: auto
category: rules
---

This rule governs all database-related operations, schema design, and data management practices for the BrewForm platform.

## Prisma Schema Management

### Schema Design Principles
- Use descriptive model names in PascalCase (e.g., `User`, `Recipe`, `CoffeeBean`)
- Use snake_case for field names (e.g., `created_at`, `user_id`)
- Include proper timestamps: `created_at` and `updated_at`
- Use `@default(now())` for timestamp fields
- Add `@updatedAt` for automatic timestamp updates
- Use proper relationships with `@relation` decorator

### Field Types and Constraints
- Use `String` for text fields with appropriate `@db.VarChar` limits
- Use `Int` for numeric IDs and counters
- Use `BigInt` for large IDs (Prisma default)
- Use `DateTime` for timestamps with `@db.Timestamptz`
- Use `Boolean` for flags and status fields
- Use `Json` for flexible schema data
- Add `@unique` constraints for natural keys
- Use `@default(uuid())` for non-sequential IDs when needed

### Relationship Best Practices
- Always define foreign key relationships explicitly
- Use `@relation` with proper field references
- Define cascading deletes carefully (`onDelete: Cascade`)
- Use many-to-many relationships for junction tables
- Add proper indexing on foreign keys
- Consider referential integrity in design

## Migration Management

### Migration Workflow
```bash
# Always run these commands in Docker container
make db-generate          # Generate Prisma client
make db-migrate           # Apply migrations to database
make db-studio            # Open Prisma Studio for inspection
make db-reset             # Reset database (development only)
```

### Migration Best Practices
- Create descriptive migration names
- Review generated migrations before applying
- Test migrations on staging environment first
- Never modify existing migration files
- Use `prisma migrate dev` for development changes
- Use `prisma migrate deploy` for production deployments

### Schema Changes
- Add new fields as nullable first, then populate data
- Use `@map` for legacy column name compatibility
- Use `@@map` for legacy table name compatibility
- Consider data migration scripts for complex changes
- Document breaking changes properly
- Test schema changes with sample data

## Database Operations

### Query Best Practices
- Use Prisma's type-safe query methods
- Leverage `include` and `select` for efficient queries
- Use `where` clauses with proper indexing
- Implement pagination with `skip` and `take`
- Use transactions for multi-table operations
- Avoid N+1 query problems with proper includes

### Performance Optimization
- Add database indexes on frequently queried fields
- Use `@@index` for composite indexes
- Consider `@@unique` for frequently queried combinations
- Use `findMany` with proper filtering
- Implement query result caching where appropriate
- Monitor slow queries and optimize them

### Data Validation
- Use Zod schemas for input validation
- Implement database constraints for data integrity
- Use proper field length limits
- Validate email formats and URLs
- Implement proper enum values
- Use check constraints for business rules

## Coffee-Specific Data Models

### Recipe Management
```prisma
model Recipe {
  id          String   @id @default(cuid())
  title       String   @db.VarChar(200)
  description String?  @db.Text
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  versions    RecipeVersion[]
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  
  @@index([userId])
  @@index([createdAt])
}
```

### Equipment Tracking
```prisma
model Equipment {
  id          String    @id @default(cuid())
  name        String    @db.VarChar(100)
  type        EquipmentType
  brand       String?   @db.VarChar(50)
  model       String?   @db.VarChar(50)
  userId      String
  user        User      @relation(fields: [userId], references: [id])
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")
  
  @@index([userId, type])
}
```

### Coffee Bean Management
```prisma
model CoffeeBean {
  id           String       @id @default(cuid())
  name         String       @db.VarChar(100)
  roaster      String       @db.VarChar(100)
  origin       String?      @db.VarChar(100)
  process      ProcessType?
  roastLevel   RoastLevel?
  notes        String?      @db.Text
  userId       String
  user         User         @relation(fields: [userId], references: [id])
  createdAt    DateTime     @default(now()) @map("created_at")
  updatedAt    DateTime     @updatedAt @map("updated_at")
  
  @@index([userId])
  @@index([roaster])
}
```

## Data Integrity and Security

### Data Privacy
- Hash passwords with bcrypt (never store plain text)
- Use proper data encryption for sensitive fields
- Implement data retention policies
- Use soft deletes for audit trails
- Consider GDPR compliance for user data
- Implement proper data anonymization for testing

### Access Control
- Implement row-level security patterns
- Use proper user ownership checks
- Validate user permissions in queries
- Use database transactions for consistency
- Implement audit logging for data changes
- Use proper error handling for data access

### Backup and Recovery
- Set up regular database backups
- Test backup restoration procedures
- Implement point-in-time recovery
- Use proper backup encryption
- Document backup and restore procedures
- Monitor backup success/failure

## Development Practices

### Seeding and Testing Data
- Create realistic seed data for development
- Use factory patterns for test data generation
- Include edge cases in test data
- Keep seed data version controlled
- Use separate databases for testing
- Clean up test data properly

### Environment Management
- Use different databases for each environment
- Never use production data in development
- Use environment-specific database URLs
- Implement proper database connection pooling
- Use Docker for consistent database environments
- Document database setup procedures

### Monitoring and Maintenance
- Monitor database performance metrics
- Set up alerts for slow queries
- Regular database maintenance (vacuum, analyze)
- Monitor connection pool usage
- Track database growth trends
- Implement proper logging for database operations
