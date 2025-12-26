---
trigger: auto
category: rules
---

This rule provides technology-specific coding guidelines and best practices for the BrewForm stack.

## Backend Development (Hono + Node.js)

### Hono Framework Guidelines
- Use Hono's built-in middleware for common tasks (cors, logger, etc.)
- Implement proper error handling with Hono's error middleware
- Use Zod schemas for request/response validation
- Follow RESTful conventions for API endpoints
- Use meaningful HTTP status codes
- Implement rate limiting on sensitive endpoints

### Node.js Best Practices
- Use ES modules (import/export) consistently
- Leverage async/await for asynchronous operations
- Use structured logging with Pino
- Implement proper error boundaries
- Use environment variables for configuration
- Follow the principle of least privilege

## Frontend Development (React + BaseUI)

### React Best Practices
- Use functional components with hooks
- Implement proper prop types with TypeScript
- Use React.memo for performance optimization
- Follow the rules of hooks
- Use custom hooks for reusable logic
- Implement proper error boundaries

### BaseUI Guidelines
- Use BaseUI components consistently
- Customize themes through Styletron
- Implement responsive design patterns
- Use proper accessibility attributes
- Follow BaseUI's component composition patterns
- Leverage BaseUI's built-in theming system

### State Management
- Use SWR for server state fetching
- Use React Context for global state (auth, theme)
- Implement proper loading and error states
- Use optimistic updates where appropriate
- Cache API responses strategically
- Implement proper data synchronization

## Database Development (Prisma + PostgreSQL)

### Prisma Best Practices
- Use Prisma schema for all database operations
- Implement proper relationships and foreign keys
- Use descriptive model and field names
- Add proper indexes for performance
- Use Prisma migrations for schema changes
- Implement proper data validation in schema

### PostgreSQL Guidelines
- Use appropriate data types for columns
- Implement proper constraints and checks
- Use transactions for multi-table operations
- Optimize queries with proper indexing
- Use connection pooling for performance
- Implement proper backup strategies

## Testing Guidelines

### Vitest Best Practices
- Write unit tests for business logic
- Use describe/it/test blocks appropriately
- Mock external dependencies properly
- Test both happy path and error cases
- Use meaningful test descriptions
- Maintain good test coverage

### Integration Testing
- Test API endpoints with realistic data
- Test database operations end-to-end
- Use test databases for isolation
- Mock external services in tests
- Test authentication and authorization flows
- Validate error handling in tests

## Code Quality

### TypeScript Guidelines
- Use strict TypeScript configuration
- Prefer explicit types over inferred types
- Use interfaces for object shapes
- Use proper generic types
- Avoid 'any' type when possible
- Use type guards for runtime validation

### Biome.js Configuration
- Follow the project's Biome configuration
- Use consistent code formatting
- Enable all recommended linting rules
- Fix linting issues before committing
- Use auto-imports and organize imports
- Maintain consistent naming conventions

## Security Best Practices

### Authentication & Authorization
- Use JWT with proper expiration
- Implement refresh token rotation
- Validate JWT signatures properly
- Use secure cookie settings
- Implement proper session management
- Use principle of least privilege

### Data Validation
- Validate all user inputs with Zod
- Sanitize data before database operations
- Use parameterized queries (Prisma handles this)
- Implement proper error message handling
- Validate file uploads properly
- Use HTTPS in production

### API Security
- Implement proper CORS configuration
- Use rate limiting on all endpoints
- Validate API versioning
- Implement proper authentication middleware
- Use security headers (helmet.js)
- Log security events appropriately

## Performance Optimization

### Backend Performance
- Use Redis for caching frequently accessed data
- Implement database query optimization
- Use connection pooling for database
- Implement proper lazy loading
- Use compression for API responses
- Monitor and optimize slow queries

### Frontend Performance
- Use code splitting for large applications
- Implement proper caching strategies
- Optimize bundle size with tree shaking
- Use lazy loading for components
- Implement proper image optimization
- Use performance monitoring tools

## Development Workflow

### Git Workflow
- Use feature branches for new development
- Write meaningful commit messages
- Use conventional commit format
- Pull request reviews are required
- Keep PRs focused and small
- Use proper branching strategy

### Environment Management
- Use .env.example for configuration templates
- Never commit secrets to version control
- Use different configs for dev/staging/prod
- Implement proper environment validation
- Use Docker for consistent environments
- Document environment variables clearly
