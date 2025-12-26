---
trigger: auto
category: rules
---

This rule governs all API development practices, endpoint design, and backend architecture for the BrewForm platform.

## Hono Framework Guidelines

### Project Structure
```
apps/api/src/
├── config/          # Environment configuration
├── middleware/      # Custom middleware (auth, logging, etc.)
├── modules/         # Feature modules (auth, recipe, user, social)
├── utils/           # Shared utilities
├── types/           # TypeScript type definitions
└── index.ts         # Application entry point
```

### Application Setup
- Use Hono with proper middleware chain
- Configure CORS for frontend domains
- Implement structured logging with Pino
- Use Zod for request/response validation
- Set up proper error handling middleware
- Configure environment variables properly

### Middleware Implementation
```typescript
// Example middleware structure
import { Context, Next } from 'hono'
import { zValidator } from '@hono/zod-validator'

// Authentication middleware
export const authMiddleware = async (c: Context, next: Next) => {
  // JWT validation logic
  await next()
}

// Request validation middleware
export const validateRequest = (schema: z.ZodSchema) => {
  return zValidator('json', schema)
}
```

## API Design Principles

### RESTful Conventions
- Use proper HTTP methods (GET, POST, PATCH, DELETE)
- Use plural nouns for resource names
- Implement proper status codes
- Use consistent URL patterns
- Implement proper pagination
- Use resource nesting for relationships

### Endpoint Structure
```typescript
// API versioning
app.route('/api/v1/auth', authRoutes)
app.route('/api/v1/recipes', recipeRoutes)
app.route('/api/v1/users', userRoutes)
app.route('/api/v1/social', socialRoutes)

// Health checks
app.get('/health', healthCheckHandler)
app.get('/health/ready', readinessHandler)
app.get('/health/live', livenessHandler)
```

### Response Format Standards
```typescript
// Success response
interface SuccessResponse<T> {
  success: true
  data: T
  message?: string
  pagination?: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// Error response
interface ErrorResponse {
  success: false
  error: {
    code: string
    message: string
    details?: any
  }
}
```

## Authentication & Authorization

### JWT Implementation
```typescript
// JWT token structure
interface JWTPayload {
  userId: string
  email: string
  role: 'user' | 'admin'
  iat: number
  exp: number
}

// Token management
export class TokenService {
  generateAccessToken(payload: JWTPayload): string
  generateRefreshToken(payload: JWTPayload): string
  verifyToken(token: string): JWTPayload
  refreshAccessToken(refreshToken: string): string
}
```

### Authorization Patterns
```typescript
// Role-based access control
export const requireRole = (roles: string[]) => {
  return async (c: Context, next: Next) => {
    const user = c.get('user')
    if (!roles.includes(user.role)) {
      return c.json({ error: 'Insufficient permissions' }, 403)
    }
    await next()
  }
}

// Resource ownership check
export const requireOwnership = (resourceType: string) => {
  return async (c: Context, next: Next) => {
    const userId = c.get('user').id
    const resourceId = c.param('id')
    // Check ownership logic
    await next()
  }
}
```

## Data Validation

### Zod Schema Examples
```typescript
// Recipe creation schema
const createRecipeSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  coffeeBeanId: z.string().cuid(),
  equipmentId: z.string().cuid(),
  brewingMethod: z.enum(['espresso', 'pour-over', 'french-press', 'aeropress']),
  parameters: z.object({
    dose: z.number().positive(),
    yield: z.number().positive(),
    time: z.number().positive(),
    temperature: z.number().min(50).max(100),
    grindSize: z.string().optional(),
  }),
})

// User registration schema
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
})
```

### Validation Middleware
```typescript
// Request validation
app.post('/recipes', 
  authMiddleware,
  validateRequest(createRecipeSchema),
  createRecipeHandler
)

// Parameter validation
const idSchema = z.string().cuid()
app.get('/recipes/:id', 
  validateParams(z.object({ id: idSchema })),
  getRecipeHandler
)
```

## Error Handling

### Error Types
```typescript
// Custom error classes
export class ValidationError extends Error {
  constructor(message: string, public details: any) {
    super(message)
    this.name = 'ValidationError'
  }
}

export class NotFoundError extends Error {
  constructor(resource: string) {
    super(`${resource} not found`)
    this.name = 'NotFoundError'
  }
}

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}
```

### Error Handler Middleware
```typescript
// Global error handler
export const errorHandler = (err: Error, c: Context) => {
  const logger = c.get('logger')
  
  if (err instanceof ValidationError) {
    logger.warn({ error: err.details }, 'Validation error')
    return c.json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: err.message,
        details: err.details
      }
    }, 400)
  }
  
  if (err instanceof NotFoundError) {
    return c.json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: err.message
      }
    }, 404)
  }
  
  // Log unexpected errors
  logger.error({ error: err.stack }, 'Unexpected error')
  return c.json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error'
    }
  }, 500)
}
```

## Database Operations

### Prisma Best Practices
```typescript
// Service layer pattern
export class RecipeService {
  async createRecipe(userId: string, data: CreateRecipeDto) {
    return await prisma.recipe.create({
      data: {
        ...data,
        userId,
        versions: {
          create: {
            version: 1,
            ...data.parameters
          }
        }
      },
      include: {
        user: {
          select: { id: true, username: true }
        },
        versions: true
      }
    })
  }
  
  async getRecipes(options: GetRecipesDto) {
    const { page = 1, limit = 20, userId } = options
    const skip = (page - 1) * limit
    
    return await prisma.recipe.findMany({
      where: userId ? { userId } : {},
      include: {
        user: { select: { id: true, username: true } },
        _count: { select: { versions: true } }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit
    })
  }
}
```

### Transaction Usage
```typescript
// Complex operations with transactions
export async function createRecipeWithVersion(userId: string, data: CreateRecipeDto) {
  return await prisma.$transaction(async (tx) => {
    const recipe = await tx.recipe.create({
      data: { ...data, userId }
    })
    
    const version = await tx.recipeVersion.create({
      data: {
        recipeId: recipe.id,
        version: 1,
        ...data.parameters
      }
    })
    
    return { recipe, version }
  })
}
```

## Performance Optimization

### Caching Strategies
```typescript
// Redis caching implementation
export class CacheService {
  async get<T>(key: string): Promise<T | null>
  async set(key: string, value: any, ttl?: number): Promise<void>
  async del(key: string): Promise<void>
  async invalidatePattern(pattern: string): Promise<void>
}

// Cached API responses
app.get('/recipes/popular', 
  cacheMiddleware('recipes:popular', 300), // 5 minutes cache
  getPopularRecipesHandler
)
```

### Rate Limiting
```typescript
// Rate limiting middleware
export const rateLimitMiddleware = (options: {
  windowMs: number
  maxRequests: number
}) => {
  return async (c: Context, next: Next) => {
    const clientIp = c.req.header('x-forwarded-for') || c.req.ip
    const key = `rate_limit:${clientIp}`
    
    // Redis-based rate limiting logic
    await next()
  }
}
```

## Testing API Endpoints

### Unit Testing
```typescript
// Example test structure
describe('Recipe API', () => {
  beforeEach(async () => {
    await setupTestDatabase()
  })
  
  it('should create a recipe', async () => {
    const response = await app.request('/api/v1/recipes', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${userToken}` },
      body: JSON.stringify(validRecipeData)
    })
    
    expect(response.status).toBe(201)
    const data = await response.json()
    expect(data.success).toBe(true)
    expect(data.data.title).toBe(validRecipeData.title)
  })
})
```

### Integration Testing
```typescript
// End-to-end API testing
describe('Recipe Workflow', () => {
  it('should complete full recipe lifecycle', async () => {
    // Create user
    const user = await createTestUser()
    
    // Create recipe
    const recipe = await createTestRecipe(user.id)
    
    // Update recipe
    const updated = await updateRecipe(recipe.id, updateData)
    
    // Delete recipe
    await deleteRecipe(recipe.id)
    
    // Verify deletion
    const deleted = await getRecipe(recipe.id)
    expect(deleted).toBeNull()
  })
})
```

## Security Best Practices

### Input Sanitization
- Validate all inputs with Zod schemas
- Sanitize user-generated content
- Use parameterized queries (Prisma handles this)
- Implement proper file upload validation
- Use secure cookie settings
- Implement CSRF protection

### API Security Headers
```typescript
// Security middleware
app.use('*', async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('X-XSS-Protection', '1; mode=block')
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  await next()
})
```

### Monitoring and Logging
```typescript
// Request logging middleware
export const requestLogger = async (c: Context, next: Next) => {
  const start = Date.now()
  const logger = c.get('logger')
  
  await next()
  
  const duration = Date.now() - start
  logger.info({
    method: c.req.method,
    url: c.req.url,
    status: c.res.status,
    duration,
    userAgent: c.req.header('user-agent'),
    ip: c.req.header('x-forwarded-for') || c.req.ip
  }, 'HTTP Request')
}
```
