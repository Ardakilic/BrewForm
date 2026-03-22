---
trigger: always_on
root: false
targets:
  - '*'
globs: []
---

<typescript_imports>
**CRITICAL**: All local imports must include explicit `.ts` or `.tsx` extensions.

```typescript
// ✅ Correct - explicit extensions
import { getPrisma } from '../utils/database/index.ts'
import { AuthProvider } from './contexts/AuthContext.tsx'
import { Card } from '../components/Card.tsx'

// ❌ Wrong - missing extensions
import { getPrisma } from '../utils/database/index'
import { AuthProvider } from './contexts/AuthContext'
```

**Why?**
- Deno requires explicit extensions for ES module compatibility
- No `--sloppy-imports` flag needed with explicit extensions
- Future-proof for browser-native ESM
</typescript_imports>

<import_conventions>
**External packages:** No extension needed
```typescript
import { Hono } from 'hono'
import { z } from 'zod'
import { PrismaClient } from '../../../prisma/generated/prisma'
```

**Relative imports:** Always use `.ts` or `.tsx`
```typescript
import type { User } from './types/index.ts'
import { validateEmail } from './utils/validation.ts'
```

**Test imports:** Use `.ts` extension
```typescript
import { mockFn } from '../test/mock-fn.ts'
import { createMockPrisma } from '../test/setup.ts'
```
</import_conventions>

<file_naming>
**Backend (API):**
- Routes/modules: `kebab-case` (e.g., `taste-notes.ts`, `reset-password.ts`)
- Utils/services: `camelCase` for files, `index.ts` for exports
- Tests: `*.test.ts` alongside source files

**Frontend (Web):**
- Components: `PascalCase.tsx` (e.g., `Card.tsx`, `LoadingSpinner.tsx`)
- Pages: `PascalCase.tsx` (e.g., `HomePage.tsx`, `RecipesPage.tsx`)
- Utilities: `camelCase.ts` (e.g., `api.ts`, `formatters.ts`)
- Tests: `*.test.tsx` alongside components
</file_naming>

<hono_conventions>
**Route definition:**
```typescript
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'

const app = new Hono()

// Use descriptive route handlers
app.get('/recipes', getRecipesHandler)
app.post('/recipes', 
  authMiddleware,
  zValidator('json', createRecipeSchema),
  createRecipeHandler
)
```

**Module exports:**
```typescript
// Export default Hono instance from route modules
export default recipes
```

**Middleware order:**
1. Request ID / Logger
2. CORS
3. Rate limiting
4. Authentication
5. Validation
6. Route handler
</hono_conventions>

<deno_formatting>
- Use Deno's built-in formatter: `deno fmt`
- 2-space indentation
- Single quotes for strings
- Semicolons required
- Max line length: 80 (auto-wrapped by formatter)
- Run `make format` before committing
</deno_formatting>

<code_organization>
**Imports order:**
1. External packages (Deno, npm)
2. Internal absolute imports
3. Internal relative imports
4. Type-only imports last

```typescript
// External
import { Hono } from 'hono'
import { z } from 'zod'

// Internal utilities
import { getPrisma } from '../../utils/database/index.ts'
import { getLogger } from '../../utils/logger/index.ts'

// Local modules
import { recipeService } from './service.ts'
import { authMiddleware } from '../../middleware/auth.ts'

// Types
import type { Recipe, RecipeInput } from './types.ts'
```
</code_organization>

<testing_conventions>
**Test file structure:**
```typescript
import { describe, it, beforeEach } from 'jsr:@std/testing/bdd'
import { expect } from 'jsr:@std/expect'
import { mockFn } from '../test/mock-fn.ts'

describe('Feature', () => {
  beforeEach(() => {
    // Setup
  })

  it('should do something', () => {
    // Test
    expect(result).toBe(expected)
  })
})
```

**Test commands:**
- Use Deno's native test runner (not Vitest)
- `make test` - run all tests via Docker
- `make test-api` - API tests only
- `make test-web` - Web tests only
- No `--sloppy-imports` or `--no-check` in production code
</testing_conventions>

<export_patterns>
**Index files** (`index.ts`):
```typescript
// Re-export with explicit extensions
export * from './helpers.ts'
export * from './validators.ts'
export { default } from './main.ts'
```

**Named exports preferred:**
```typescript
// ✅ Preferred
export function getUserById(id: string) { }
export const userSchema = z.object({ })

// ❌ Avoid default exports except for Hono routes and React components
```
</export_patterns>

<type_definitions>
- Define interfaces/types in separate `types.ts` files
- Use `type` for unions and primitives
- Use `interface` for object shapes
- Export types from main module index

```typescript
// types.ts
export interface User {
  id: string
  email: string
}

export type UserRole = 'admin' | 'user' | 'barista'
```
</type_definitions>
