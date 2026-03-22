# Deno Migration Guide for BrewForm Monorepo

## Overview

This document provides a comprehensive migration strategy from Node.js to Deno for our Turbo monorepo with Hono (backend) and React (frontend). It addresses all suggestions received and provides clear validation on what to migrate, what to keep, and why.

---

## Executive Summary

| Component | Current | Recommendation | Priority |
|-----------|---------|-----------------|----------|
| **Backend API** (Hono) | tsup + tsx | `deno compile` + `deno run --watch` | 🔴 HIGH |
| **Type Checking** (Web) | tsc | `deno check` | 🔴 HIGH |
| **Testing** | Jest/Vitest | `deno test` | ✅ DONE |
| **Linting** | ESLint | `deno lint` | ✅ DONE |
| **Formatting** | Prettier | `deno fmt` | ✅ DONE |
| **Frontend Build** | Vite | Keep Vite | ❌ DO NOT CHANGE |
| **React Framework** | React + Vite | Keep (Fresh not suitable yet) | ❌ DO NOT CHANGE |
| **Database** | Prisma | Keep Prisma | ❌ DO NOT CHANGE |
| **Hosting** | Current setup | Evaluate Deno Deploy later | 🟡 MEDIUM |

---

## Detailed Validation & Implementation Guide

### 1. HIGH PRIORITY: Migrate Type Checking from `tsc` to `deno check`

#### Status: ✅ **HIGHLY RECOMMENDED - Easy Win**

#### Why This Matters
- Eliminates separate TypeScript compiler dependency
- Uses Deno's built-in type checker (faster, no Node.js overhead)
- Unified tooling across backend and frontend
- Reduces dependency footprint

#### Current State
Your web build likely includes:
\`\`\`bash
tsc --noEmit
\`\`\`

#### Implementation

**Step 1: Update root `deno.json`**
\`\`\`json
{
  "tasks": {
    "type-check": "deno check",
    "type-check:all": "deno check --all",
    "type-check:watch": "deno check --watch"
  }
}
\`\`\`

**Step 2: Update web app `deno.json` (or create if needed)**
\`\`\`json
{
  "tasks": {
    "type-check": "deno check src/main.tsx"
  }
}
\`\`\`

**Step 3: Replace in CI/CD pipeline**
\`\`\`bash
# Old
npm run type-check

# New
deno check --all
\`\`\`

**Step 4: Update Makefile (if used)**
\`\`\`makefile
.PHONY: type-check
type-check:
\tdeno check --all

.PHONY: type-check-watch
type-check-watch:
\tdeno check --watch
\`\`\`

#### Verification
Run before and after to ensure no new errors:
\`\`\`bash
deno check --all
\`\`\`

#### Notes
- Use `--all` flag to include remote modules and npm packages
- Can run in watch mode with `--watch` for development
- Works with your existing `deno.json` configuration

---

### 2. HIGH PRIORITY: Remove `tsup` from API Build

#### Status: ✅ **RECOMMENDED - Replace with `deno compile`**

#### Why This Matters
- Eliminates Node.js build tool from backend
- Deno's native compiler creates standalone executables
- Faster builds without Node.js overhead
- Simpler configuration

#### Current State
Your API likely builds with:
\`\`\`bash
tsup src/main.ts --outDir dist --format esm
\`\`\`

#### Implementation

**Step 1: Update API `deno.json`**
\`\`\`json
{
  "tasks": {
    "dev": "deno run --watch -A src/main.ts",
    "build": "deno compile -A -o dist/api src/main.ts",
    "start": "./dist/api"
  }
}
\`\`\`

**Step 2: Update root Turbo config (`turbo.json`)**
\`\`\`json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"],
      "cache": true
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
\`\`\`

**Step 3: Update Makefile**
\`\`\`makefile
.PHONY: build-api
build-api:
\tcd apps/api && deno compile -A -o dist/api src/main.ts

.PHONY: dev-api
dev-api:
\tcd apps/api && deno run --watch -A src/main.ts
\`\`\`

**Step 4: Update Docker (if applicable)**
\`\`\`dockerfile
# Old approach with Node.js
FROM node:20
RUN npm install -g tsup
WORKDIR /app
COPY . .
RUN tsup src/main.ts --outDir dist

# New approach with Deno
FROM denoland/deno:latest
WORKDIR /app
COPY . .
RUN deno compile -A -o dist/api src/main.ts
CMD ["./dist/api"]
\`\`\`

#### Verification
\`\`\`bash
# Build
deno compile -A -o dist/api src/main.ts

# Test the executable
./dist/api

# Verify it's standalone (no Node.js needed)
file dist/api
\`\`\`

#### Output
- Creates a single executable binary
- No runtime dependencies needed
- Faster startup time than Node.js + tsup

---

### 3. HIGH PRIORITY: Remove `tsx` if Not Used

#### Status: ✅ **RECOMMENDED - Replace with `deno run`**

#### Why This Matters
- `tsx` is a Node.js TypeScript executor - not needed with Deno
- Deno handles TypeScript natively
- One less dependency to maintain

#### How to Check If You're Using `tsx`

Search your codebase:
\`\`\`bash
grep -r "tsx" --include="*.json" --include="*.ts" --include="*.js"
grep -r "tsx" package.json apps/*/package.json
\`\`\`

#### Current Usage Scenarios
\`\`\`json
{
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "seed": "tsx prisma/seed.ts"
  }
}
\`\`\`

#### Replacement

**For development with watch mode:**
\`\`\`bash
# Old
tsx watch src/main.ts

# New
deno run --watch -A src/main.ts
\`\`\`

**For running scripts:**
\`\`\`bash
# Old
tsx prisma/seed.ts

# New
deno run -A prisma/seed.ts
\`\`\`

**Updated `deno.json`:**
\`\`\`json
{
  "tasks": {
    "dev": "deno run --watch -A src/main.ts",
    "seed": "deno run -A prisma/seed.ts",
    "migrate": "deno run -A npm:prisma migrate dev"
  }
}
\`\`\`

#### Permissions Flag Explanation
- `-A` = grant all permissions (alternative: be specific with `--allow-net`, `--allow-read`, etc.)
- Example with specific permissions:
\`\`\`bash
deno run --allow-net --allow-env --allow-read src/main.ts
\`\`\`

#### Verification
\`\`\`bash
# Test running your API
deno run -A src/main.ts

# Verify output matches old tsx behavior
curl http://localhost:3000/health
\`\`\`

---

## MEDIUM PRIORITY: Lower Priority Recommendations

### 4. DO NOT MIGRATE NOW: Fresh Framework for React

#### Status: ⚠️ **NOT RECOMMENDED FOR CURRENT APP**

#### What Fresh Is
- Deno-native full-stack framework
- Islands architecture for partial hydration
- Built-in server rendering
- Minimal build step philosophy

#### Why NOT to Migrate Now
\`\`\`
❌ Ecosystem mismatch: Your React + Prisma stack is mature and established
❌ Rewriting cost: Complete frontend restructure required
❌ Library compatibility: Your React libraries may not work with Fresh
❌ Team knowledge: Team expertise is in React/Vite, not Fresh
❌ Not a drop-in replacement: Requires architectural changes
\`\`\`

#### When to Consider Fresh
- ✅ New Deno projects from scratch
- ✅ Full-stack monolithic apps (backend + frontend together)
- ✅ Don't need specific React ecosystem libraries
- ✅ Want maximum Deno integration for greenfield work

#### Recommendation
**Keep Vite + React for current application.** Plan Fresh adoption for future greenfield projects only.

---

### 5. EVALUATE LATER: Deno Deploy for Hosting

#### Status: 🟡 **EVALUATE ONLY IF NEEDED**

#### What Deno Deploy Is
- Serverless platform optimized for Deno
- Fast cold starts
- Native Deno feature support
- Global edge deployment

#### Important Considerations

**Your Frontend (React):**
- Still needs static hosting (Vercel, Netlify, AWS S3, etc.)
- Not a candidate for Deno Deploy

**Your Backend (Hono + Prisma):**
- Can run on Deno Deploy ✅
- BUT: Requires database connection pooling for serverless
- Prisma needs special configuration for Deno Deploy

**Your Current Setup:**
- Docker-based: Running on VPS, container platform, or cloud provider
- Question: Is your current hosting problematic?
  - If happy with current setup: No need to change
  - If looking for cost reduction: Might evaluate Deno Deploy
  - If need global CDN: Deno Deploy is interesting

#### Decision Checklist
\`\`\`
Before considering Deno Deploy, answer:

□ Is our current hosting setup causing issues?
□ Do we need global edge deployment?
□ Can we set up Prisma connection pooling? (PlanetScale, Neon, etc.)
□ Do we want to eliminate Docker infrastructure?
□ Is cost a factor in hosting decision?
\`\`\`

#### Recommendation
**Skip for now.** Revisit in 6 months if:
- Current hosting is unsatisfactory
- Need cost optimization
- Want to reduce DevOps complexity

---

## Migration Checklist

### Phase 1: Immediate (This Sprint)

\`\`\`
Type Checking Migration
□ Add deno check to deno.json root config
□ Test deno check --all works without errors
□ Update CI/CD pipeline to use deno check instead of tsc
□ Update Makefile if applicable
□ Document for team
□ Remove tsc dependency from package.json

API Build Migration
□ Update API deno.json with deno compile task
□ Test deno compile -A -o dist/api src/main.ts
□ Verify executable works standalone
□ Update Makefile with new build command
□ Test in development: deno run --watch -A src/main.ts
□ Document changes for team

Remove tsx
□ Search codebase for tsx usage
□ Replace with deno run equivalents
□ Update all deno.json task definitions
□ Test all scripts work with deno run
□ Remove tsx from dependencies
□ Document changes for team
\`\`\`

### Phase 2: Next Sprint

\`\`\`
Docker Updates
□ Update Dockerfile to use denoland/deno image
□ Test Docker build creates working executable
□ Test Docker container runs API successfully
□ Document Docker changes

CI/CD Updates
□ Update GitHub Actions (or other CI) to use Deno commands
□ Remove Node.js build steps where applicable
□ Verify all tests still pass with deno test
□ Update build time metrics (should be faster)

Dependency Cleanup
□ Remove unused Node.js tooling packages
□ Update lockfiles
□ Test full build process
□ Document final dependency list
\`\`\`

### Phase 3: Future (When Applicable)

\`\`\`
Hosting Evaluation
□ Assess current hosting satisfaction
□ Research Deno Deploy capabilities
□ Evaluate if Fresh framework makes sense for new projects
□ Plan architecture if considering either migration
\`\`\`

---

## Command Reference

### Development

\`\`\`bash
# Run API with watch mode
deno run --watch -A apps/api/src/main.ts

# Type check everything
deno check --all

# Format code
deno fmt

# Lint code
deno lint

# Run tests
deno test
\`\`\`

### Building for Production

\`\`\`bash
# Build executable
deno compile -A -o dist/api apps/api/src/main.ts

# Build web
npm run build -w web

# Type check all
deno check --all
\`\`\`

### Dockerfile

\`\`\`dockerfile
FROM denoland/deno:latest

WORKDIR /app

# Copy dependencies
COPY deno.json deno.lock ./
COPY apps/api apps/api

# Cache dependencies
RUN deno cache apps/api/src/main.ts

# Compile to executable
RUN deno compile -A -o dist/api apps/api/src/main.ts

# Run
CMD ["./dist/api"]
\`\`\`

---

## File Structure After Migration

\`\`\`
BrewForm/
├── deno.json                    # Root Deno config
├── deno.lock                    # Deno lockfile
├── turbo.json                   # Turbo config
├── Makefile                     # Updated with Deno commands
│
├── apps/
│   ├── api/
│   │   ├── deno.json           # API-specific config
│   │   ├── src/
│   │   │   └── main.ts
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── seed.ts
│   │   └── dist/
│   │       └── api             # Compiled executable (NEW)
│   │
│   └── web/
│       ├── package.json        # Still uses npm (React)
│       ├── vite.config.ts
│       ├── src/
│       │   └── main.tsx
│       └── dist/               # Vite output
│
├── packages/
│   └── ui/                      # Shared components
│
└── node_modules/               # Reduced, no tsup/tsx
\`\`\`

---

## Troubleshooting

### Issue: `deno check` reports errors that `tsc` didn't

**Solution:**
Deno's type checker is stricter. Update your code to be fully typed, or:
\`\`\`bash
deno check --unstable-sloppy-imports
\`\`\`

### Issue: Compiled executable won't start

**Solution:**
\`\`\`bash
# Run with more verbose output
deno compile -A --log-level debug -o dist/api src/main.ts

# Test permissions
./dist/api --version
\`\`\`

### Issue: Prisma commands not working with `deno run`

**Solution:**
Use npm prefix:
\`\`\`bash
deno run -A npm:prisma migrate dev
deno run -A npm:prisma generate
\`\`\`

### Issue: npm packages not available with `deno run`

**Solution:**
Ensure package is available on npm and referenced correctly:
\`\`\`typescript
// Correct
import something from "npm:package-name@version";

// Alternative - use deno.json imports
\`\`\`

---

## Verification Steps

### Before Merging PR

\`\`\`bash
# 1. Type check everything
deno check --all

# 2. Lint everything
deno lint

# 3. Format check
deno fmt --check

# 4. Run all tests
deno test

# 5. Build API
deno compile -A -o dist/api apps/api/src/main.ts

# 6. Test compiled binary
./dist/api &
curl http://localhost:3000/health

# 7. Build web
cd apps/web && npm run build

# 8. Full integration test
npm run test
\`\`\`

---

## FAQ

**Q: Will removing tsup break anything?**
A: No, `deno compile` replaces it directly. `deno compile` creates a standalone executable, while tsup created bundled code. Deno's approach is simpler.

**Q: Do we need to keep Node.js?**
A: Yes - your React frontend (Vite) and npm packages still need Node.js. Only the backend can be pure Deno.

**Q: Can we deploy the compiled executable to our current infrastructure?**
A: Yes! The executable works on any Linux/macOS/Windows system without Node.js installed.

**Q: What about the `node_modules` folder?**
A: Shrinks significantly. Deno manages dependencies via `deno.lock` instead.

**Q: Is this a breaking change?**
A: No - these are additive changes. Existing functionality remains identical, just with different tooling.

**Q: What if we find issues in production?**
A: Easy rollback - keep old setup running, switch traffic back to old deployments while investigating.

---

## Team Communication

### For Your Team

\`\`\`
🚀 MIGRATION UPDATE: Deno Build Tools

We're migrating from Node.js-based build tools to Deno's native tooling:

✅ COMPLETED (Already done)
- Testing: deno test
- Linting: deno lint
- Formatting: deno fmt

🔄 IMPLEMENTING NOW (Phase 1)
- Type checking: tsc → deno check
- API building: tsup → deno compile
- API running: tsx → deno run --watch

❌ NOT CHANGING (Keeping as-is)
- React frontend (Vite stays)
- Database (Prisma stays)

⏳ LATER (Medium priority)
- Deno Deploy evaluation (if needed)
- Fresh framework (future projects only)

Timeline: 2 weeks for Phase 1, Phase 2 next sprint

Questions? See MIGRATION.md or ask in #engineering
\`\`\`

---

## References

- [Deno Check Documentation](https://docs.deno.com)
- [Deno Compile Documentation](https://docs.deno.com)
- [Deno CLI Reference](https://docs.deno.com)
- [Fresh Framework](https://fresh.deno.dev)
- [Deno Deploy](https://deno.com/deploy)
- [Hono with Deno](https://hono.dev/docs/getting-started/deno)
- [Prisma with Deno](https://www.prisma.io/docs/getting-started/setup-prisma)

---

## Appendix: Before and After

### API Development

**Before:**
\`\`\`bash
npm install -D tsx tsup
npm run dev
# Output: tsx starting...

npm run build
# Output: tsup bundling...
\`\`\`

**After:**
\`\`\`bash
# No installations needed (already have Deno)
deno run --watch -A src/main.ts
# Output: listening on http://localhost:3000

deno compile -A -o dist/api src/main.ts
# Output: executable created
\`\`\`

### Type Checking

**Before:**
\`\`\`bash
npm run type-check
# Runs: tsc --noEmit --project tsconfig.json
# Time: ~8 seconds
\`\`\`

**After:**
\`\`\`bash
deno check --all
# Time: ~3 seconds
\`\`\`

### Dependencies

**Before:**
\`\`\`json
{
  "devDependencies": {
    "typescript": "5.x",
    "tsx": "4.x",
    "tsup": "8.x",
    "@types/node": "20.x"
  }
}
\`\`\`

**After:**
\`\`\`json
{
  "devDependencies": {
    // All removed - Deno handles this natively
  }
}
\`\`\`

---

## Sign-Off

\`\`\`
Document Version: 1.0
Date Created: [DATE]
Last Updated: [DATE]
Owner: [TEAM]
Status: READY FOR IMPLEMENTATION

Validated By:
□ Backend Lead
□ Frontend Lead
□ DevOps Lead
□ Team Lead
\`\`\`

---

**End of Migration Guide**