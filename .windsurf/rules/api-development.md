---
trigger: glob
globs: apps/api/**/*.ts
---

<hono_guidelines>
- Use Hono's built-in middleware (cors, logger)
- Use `@hono/zod-validator` for request validation
- Implement proper error handling middleware
- Follow RESTful conventions with proper HTTP methods and status codes
</hono_guidelines>

<api_structure>
```
apps/api/src/
├── config/      # Environment configuration
├── middleware/  # Auth, logging, rate limiting
├── modules/     # Feature modules (auth, recipe, user, social)
├── utils/       # Shared utilities
├── types/       # TypeScript definitions
└── index.ts     # Application entry point
```
</api_structure>

<response_format>
```typescript
// Success
{ success: true, data: T, message?: string, pagination?: {...} }

// Error
{ success: false, error: { code: string, message: string, details?: any } }
```
</response_format>

<authentication>
- Use JWT with refresh tokens (jose library)
- Hash passwords with @node-rs/argon2
- Implement role-based access control
- Check resource ownership before mutations
</authentication>

<validation>
```typescript
// Use Zod schemas for all endpoints
app.post('/recipes', 
  authMiddleware,
  zValidator('json', createRecipeSchema),
  createRecipeHandler
)
```
</validation>

<error_handling>
- Create custom error classes (ValidationError, NotFoundError, UnauthorizedError)
- Use global error handler middleware
- Log errors with Pino (structured JSON)
- Return consistent error response format
</error_handling>

<database_operations>
- Use Prisma service layer pattern
- Use transactions for multi-table operations
- Implement pagination with skip/take
- Use proper includes/selects to avoid N+1
</database_operations>

<caching>
- Use Redis for caching (ioredis)
- Cache frequently accessed data (popular recipes)
- Implement rate limiting with Redis
</caching>
