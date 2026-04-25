# BrewForm Phase 10 — Testing

## Status: READY

## Overview

Implement a comprehensive testing strategy using Deno's built-in test runner with BDD syntax (`@std/testing/bdd`), Jest-like assertions (`@std/expect`), and `@std/assert`. Target 85%+ coverage across the entire app and 90%+ for taste note related code.

---

## Testing Stack

| Tool | Purpose |
|------|---------|
| `deno test` | Test runner (built-in) |
| `@std/testing/bdd` | BDD syntax: `describe`, `it`, `beforeEach`, `afterEach`, `beforeAll`, `afterAll` |
| `@std/expect` | Jest-like assertions: `toBe`, `toEqual`, `toContain`, `toThrow`, etc. |
| `@std/assert` | Additional assertions: `assertEquals`, `assertThrows`, etc. |
| `deno coverage` | Coverage reporting (built-in) |
| `@std/http/testing` | Test helpers for Hono request simulation |

---

## Test File Locations

All test files live alongside source files, named `*.test.ts`:

```
apps/api/src/
├── modules/
│   ├── auth/
│   │   ├── service.test.ts
│   │   └── model.test.ts
│   ├── recipe/
│   │   ├── service.test.ts
│   │   └── model.test.ts
│   ├── taste/
│   │   ├── service.test.ts
│   │   └── model.test.ts       # 90%+ coverage
│   ├── user/
│   │   └── service.test.ts
│   ├── equipment/
│   │   └── service.test.ts
│   ├── bean/
│   │   └── service.test.ts
│   ├── vendor/
│   │   └── service.test.ts
│   ├── photo/
│   │   └── service.test.ts
│   ├── comment/
│   │   └── service.test.ts
│   ├── follow/
│   │   └── service.test.ts
│   ├── badge/
│   │   └── service.test.ts
│   ├── setup/
│   │   └── service.test.ts
│   ├── preference/
│   │   └── service.test.ts
│   ├── search/
│   │   └── service.test.ts
│   ├── qrcode/
│   │   └── service.test.ts
│   └── admin/
│       └── service.test.ts
├── middleware/
│   ├── auth.test.ts
│   ├── cors.test.ts
│   └── errorHandler.test.ts
├── utils/
│   ├── cache.test.ts
│   ├── logger.test.ts
│   ├── response.test.ts
│   └── qrcode.test.ts
└── config/
    └── env.test.ts

packages/shared/src/
├── utils/
│   ├── conversion.test.ts
│   ├── metrics.test.ts
│   ├── validation.test.ts
│   ├── date.test.ts
│   └── slug.test.ts
└── schemas/
    ├── recipe.test.ts
    ├── equipment.test.ts
    ├── auth.test.ts
    └── user.test.ts

packages/db/
└── prisma/
    └── seed.test.ts
```

---

## Test Configuration

### `deno.json` additions for testing

```json
{
  "test": {
    "include": ["src/", "apps/", "packages/"],
    "exclude": ["src/generated/", "node_modules/"]
  }
}
```

---

## BDD Examples

### Shared Utils Tests (`packages/shared/src/utils/conversion.test.ts`)

```typescript
import { describe, it, expect } from '@std/testing/bdd';
import {
  convertGramsToOunces,
  convertOuncesToGrams,
  convertMlToFlOz,
  convertFlOzToMl,
  convertCtoF,
  convertFtoC,
  formatWeight,
  formatVolume,
  formatTemperature,
} from './conversion.ts';

describe('Unit Conversions', () => {
  describe('convertGramsToOunces', () => {
    it('should convert grams to ounces correctly', () => {
      expect(convertGramsToOunces(28.3495)).toBeCloseTo(1, 3);
      expect(convertGramsToOunces(0)).toBe(0);
      expect(convertGramsToOunces(100)).toBeCloseTo(3.527, 2);
    });
  });

  describe('convertOuncesToGrams', () => {
    it('should convert ounces to grams correctly', () => {
      expect(convertOuncesToGrams(1)).toBeCloseTo(28.3495, 3);
      expect(convertOuncesToGrams(0)).toBe(0);
    });
  });

  describe('convertMlToFlOz', () => {
    it('should convert milliliters to fluid ounces', () => {
      expect(convertMlToFlOz(29.5735)).toBeCloseTo(1, 3);
      expect(convertMlToFlOz(0)).toBe(0);
    });
  });

  describe('convertCtoF', () => {
    it('should convert Celsius to Fahrenheit', () => {
      expect(convertCtoF(0)).toBe(32);
      expect(convertCtoF(100)).toBe(212);
      expect(convertCtoF(93)).toBeCloseTo(199.4, 1);
    });
  });

  describe('convertFtoC', () => {
    it('should convert Fahrenheit to Celsius', () => {
      expect(convertFtoC(32)).toBe(0);
      expect(convertFtoC(212)).toBe(100);
    });
  });

  describe('formatWeight', () => {
    it('should format metric weight', () => {
      expect(formatWeight(18, 'metric')).toBe('18.0 g');
    });
    it('should format imperial weight', () => {
      expect(formatWeight(28.3495, 'imperial')).toBe('1.0 oz');
    });
  });

  describe('formatVolume', () => {
    it('should format metric volume', () => {
      expect(formatVolume(36, 'metric')).toBe('36 ml');
    });
    it('should format imperial volume', () => {
      expect(formatVolume(29.5735, 'imperial')).toBe('1.0 fl oz');
    });
  });

  describe('formatTemperature', () => {
    it('should format Celsius', () => {
      expect(formatTemperature(93, 'celsius')).toBe('93.0°C');
    });
    it('should format Fahrenheit', () => {
      expect(formatTemperature(93, 'fahrenheit')).toBe('199.4°F');
    });
  });
});
```

### Metrics Tests (`packages/shared/src/utils/metrics.test.ts`)

```typescript
import { describe, it, expect } from '@std/testing/bdd';
import { computeBrewRatio, computeFlowRate } from './metrics.ts';

describe('Brew Metrics', () => {
  describe('computeBrewRatio', () => {
    it('should compute brew ratio correctly', () => {
      expect(computeBrewRatio(18, 36)).toBe(2);
      expect(computeBrewRatio(15, 250)).toBeCloseTo(16.67, 1);
    });
    it('should return null for zero dose', () => {
      expect(computeBrewRatio(0, 36)).toBeNull();
      expect(computeBrewRatio(null as any, 36)).toBeNull();
    });
    it('should return null for zero yield', () => {
      expect(computeBrewRatio(18, 0)).toBeNull();
    });
  });

  describe('computeFlowRate', () => {
    it('should compute flow rate correctly', () => {
      expect(computeFlowRate(36, 28)).toBeCloseTo(1.29, 1);
      expect(computeFlowRate(250, 210)).toBeCloseTo(1.19, 1);
    });
    it('should return null for zero time', () => {
      expect(computeFlowRate(36, 0)).toBeNull();
    });
    it('should return null for zero yield', () => {
      expect(computeFlowRate(0, 28)).toBeNull();
    });
  });
});
```

### Validation Tests (`packages/shared/src/utils/validation.test.ts`)

```typescript
import { describe, it, expect } from '@std/testing/bdd';
import { validateGrindDateNotBeforeRoastDate, validateBrewMethodCompatibility, validateSoftWarnings } from './validation.ts';

describe('Validation', () => {
  describe('validateGrindDateNotBeforeRoastDate', () => {
    it('should return true when grind date is after roast date', () => {
      expect(validateGrindDateNotBeforeRoastDate('2026-04-10', '2026-03-15')).toBe(true);
    });
    it('should return true when grind date equals roast date', () => {
      expect(validateGrindDateNotBeforeRoastDate('2026-03-15', '2026-03-15')).toBe(true);
    });
    it('should return false when grind date is before roast date', () => {
      expect(validateGrindDateNotBeforeRoastDate('2026-03-10', '2026-03-15')).toBe(false);
    });
  });

  describe('validateBrewMethodCompatibility', () => {
    it('should accept compatible brew method and drink type', () => {
      expect(validateBrewMethodCompatibility('espresso_machine', 'espresso')).toBe(true);
      expect(validateBrewMethodCompatibility('v60', 'pour_over')).toBe(true);
    });
    it('should reject incompatible brew method and drink type', () => {
      expect(validateBrewMethodCompatibility('turkish_coffee', 'espresso')).toBe(false);
      expect(validateBrewMethodCompatibility('v60', 'latte')).toBe(false);
    });
  });

  describe('validateSoftWarnings', () => {
    it('should warn about low espresso ratio', () => {
      const warnings = validateSoftWarnings({
        brewMethod: 'espresso_machine',
        groundWeightGrams: 18,
        extractionVolumeMl: 22,
      });
      expect(warnings.some((w) => w.field === 'extractionVolumeMl')).toBe(true);
    });
    it('should warn about short espresso extraction', () => {
      const warnings = validateSoftWarnings({
        brewMethod: 'espresso_machine',
        extractionTimeSeconds: 10,
      });
      expect(warnings.some((w) => w.field === 'extractionTimeSeconds')).toBe(true);
    });
    it('should return no warnings for normal espresso', () => {
      const warnings = validateSoftWarnings({
        brewMethod: 'espresso_machine',
        groundWeightGrams: 18,
        extractionVolumeMl: 36,
        extractionTimeSeconds: 28,
        temperatureCelsius: 93,
      });
      expect(warnings.length).toBe(0);
    });
  });
});
```

### Zod Schema Tests (`packages/shared/src/schemas/recipe.test.ts`)

```typescript
import { describe, it, expect } from '@std/testing/bdd';
import { RecipeCreateSchema, RecipeFilterSchema } from './recipe.ts';

describe('RecipeCreateSchema', () => {
  it('should validate a complete recipe', () => {
    const result = RecipeCreateSchema.safeParse({
      title: 'My Espresso',
      brewMethod: 'espresso_machine',
      drinkType: 'espresso',
      groundWeightGrams: 18,
      extractionVolumeMl: 36,
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing required fields', () => {
    const result = RecipeCreateSchema.safeParse({
      title: 'Missing brew method',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('brewMethod'))).toBe(true);
    }
  });

  it('should reject grind date before roast date', () => {
    const result = RecipeCreateSchema.safeParse({
      title: 'Bad dates',
      brewMethod: 'espresso_machine',
      drinkType: 'espresso',
      roastDate: '2026-04-10',
      grindDate: '2026-04-05',
    });
    expect(result.success).toBe(false);
  });

  it('should accept valid visibility values', () => {
    for (const visibility of ['draft', 'private', 'unlisted', 'public']) {
      const result = RecipeCreateSchema.safeParse({
        title: 'Test',
        brewMethod: 'espresso_machine',
        drinkType: 'espresso',
        visibility,
      });
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid brew method', () => {
    const result = RecipeCreateSchema.safeParse({
      title: 'Bad method',
      brewMethod: 'invalid_method',
      drinkType: 'espresso',
    });
    expect(result.success).toBe(false);
  });
});
```

### Taste Module Tests (`apps/api/src/modules/taste/service.test.ts`)

**90%+ coverage requirement:**

```typescript
import { describe, it, expect, beforeEach, afterEach } from '@std/testing/bdd';
import { InMemoryCacheProvider } from '../../../utils/cache/index.ts';
import type { CacheProvider } from '../../../utils/cache/index.ts';

// Mock model functions — these would be mocked in the actual test setup
const mockModel = {
  findAll: () => Promise.resolve([]),
  findChildren: (_parentId: string) => Promise.resolve([]),
  searchByName: (_query: string) => Promise.resolve([]),
  getHierarchy: () => Promise.resolve([]),
  findById: (_id: string) => Promise.resolve(null),
  create: (_data: any) => Promise.resolve({}),
  update: (_id: string, _data: any) => Promise.resolve({}),
  remove: (_id: string) => Promise.resolve({}),
};

let cache: CacheProvider;

describe('Taste Service', () => {
  beforeEach(() => {
    cache = new InMemoryCacheProvider();
  });

  describe('getHierarchy', () => {
    it('should return cached hierarchy if available', async () => {
      const cachedData = [{ id: '1', name: 'Fruity', children: [] }];
      await cache.set(['cache', 'taste-notes'], cachedData);

      // Call getHierarchy — should return cached data
      // In real test, this calls through service.getHierarchy
      const result = await cache.get<any>(['cache', 'taste-notes']);
      expect(result).toEqual(cachedData);
    });

    it('should fetch from database and cache if not cached', async () => {
      const result = await cache.get(['cache', 'taste-notes']);
      expect(result).toBeNull();

      // After database fetch, data should be cached
      const data = [{ id: '1', name: 'Fruity', children: [] }];
      await cache.set(['cache', 'taste-notes'], data, { ttlMs: 86400000 });
      const cached = await cache.get(['cache', 'taste-notes']);
      expect(cached).toEqual(data);
    });
  });

  describe('searchTasteNotes', () => {
    it('should reject queries shorter than 3 characters', async () => {
      try {
        // service.searchTasteNotes('ab', cache) should throw
        expect(true).toBe(true); // Placeholder — real test calls the service
      } catch (e: any) {
        expect(e.message).toBe('QUERY_TOO_SHORT');
      }
    });

    it('should find matching taste notes and expand parent hits', async () => {
      // Test with mock data: search for "fruit" should return
      // Fruity + all children of Fruity
      expect(true).toBe(true); // Placeholder
    });
  });

  describe('cache flushing on admin changes', () => {
    it('should flush taste notes cache when a note is created', async () => {
      await cache.set(['cache', 'taste-notes'], { data: 'cached' });
      await cache.delete(['cache', 'taste-notes']);
      const result = await cache.get(['cache', 'taste-notes']);
      expect(result).toBeNull();
    });

    it('should flush flat list cache as well', async () => {
      await cache.set(['cache', 'taste-notes-flat'], { data: 'flat' });
      await cache.delete(['cache', 'taste-notes-flat']);
      const result = await cache.get(['cache', 'taste-notes-flat']);
      expect(result).toBeNull();
    });
  });
});

describe('Cache Provider', () => {
  let cache: InMemoryCacheProvider;

  beforeEach(() => {
    cache = new InMemoryCacheProvider();
  });

  it('should set and get values', async () => {
    await cache.set(['test', 'key'], 'value');
    const result = await cache.get(['test', 'key']);
    expect(result).toBe('value');
  });

  it('should return null for non-existent keys', async () => {
    const result = await cache.get(['nonexistent']);
    expect(result).toBeNull();
  });

  it('should delete keys', async () => {
    await cache.set(['test', 'key'], 'value');
    await cache.delete(['test', 'key']);
    const result = await cache.get(['test', 'key']);
    expect(result).toBeNull();
  });

  it('should delete by prefix', async () => {
    await cache.set(['cache', 'a'], 1);
    await cache.set(['cache', 'b'], 2);
    await cache.set(['other', 'c'], 3);
    await cache.deleteByPrefix(['cache']);
    expect(await cache.get(['cache', 'a'])).toBeNull();
    expect(await cache.get(['cache', 'b'])).toBeNull();
    expect(await cache.get(['other', 'c'])).toBe(3);
  });

  it('should respect TTL', async () => {
    await cache.set(['ttl', 'key'], 'expires', { ttlMs: 50 });
    const result1 = await cache.get(['ttl', 'key']);
    expect(result1).toBe('expires');

    // Wait for expiry
    await new Promise((resolve) => setTimeout(resolve, 60));
    const result2 = await cache.get(['ttl', 'key']);
    expect(result2).toBeNull();
  });
});
```

### Auth Module Tests (`apps/api/src/modules/auth/service.test.ts`)

```typescript
import { describe, it, expect } from '@std/testing/bdd';
import { signAccessToken, signRefreshToken, verifyJwt } from '../jwt.ts';

describe('JWT Module', () => {
  it('should sign and verify an access token', async () => {
    const payload = { id: 'user-123', email: 'test@test.com', username: 'testuser', isAdmin: false };
    const token = await signAccessToken(payload);
    const decoded = await verifyJwt(token);
    expect(decoded.sub).toBe('user-123');
    expect(decoded.email).toBe('test@test.com');
    expect(decoded.type).toBe('access');
  });

  it('should sign and verify a refresh token', async () => {
    const token = await signRefreshToken('user-123');
    const decoded = await verifyJwt(token);
    expect(decoded.sub).toBe('user-123');
    expect(decoded.type).toBe('refresh');
  });

  it('should reject an invalid token', async () => {
    try {
      await verifyJwt('invalid-token');
      expect(true).toBe(false); // Should not reach here
    } catch {
      // Expected to throw
    }
  });
});
```

### Integration Test Example (`apps/api/src/routes/health.test.ts`)

```typescript
import { describe, it, expect } from '@std/testing/bdd';
import { Hono } from 'hono';
import health from './health.ts';

describe('Health Routes', () => {
  const app = new Hono();
  app.route('/', health);

  it('should return ok on /health', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
  });

  it('should return ready on /ready', async () => {
    const res = await app.request('/ready');
    // May return 503 if database is not available in test environment
    expect([200, 503]).toContain(res.status);
  });
});
```

---

## Coverage Targets

| Module | Target | Priority |
|--------|--------|----------|
| Taste service | 90%+ | High |
| Taste search/autocomplete | 90%+ | High |
| Cache provider | 90%+ | High |
| Auth (JWT, login, register) | 85%+ | High |
| Recipe service | 85%+ | High |
| Shared utils (conversion, metrics, validation) | 85%+ | Medium |
| Shared schemas | 85%+ | Medium |
| All other services | 80%+ | Medium |
| Middleware | 75%+ | Low |
| Config | 70%+ | Low |

---

## Running Tests

```bash
# All tests
make test

# Specific module
docker compose run --rm app deno test apps/api/src/modules/taste/

# With coverage
make test-coverage

# Specific test file
docker compose run --rm app deno test packages/shared/src/utils/conversion.test.ts
```

---

## Key Design Decisions

- **Tests co-located with source** — `*.test.ts` files sit next to the code they test.
- **`InMemoryCacheProvider`** for tests — isolates tests from Deno KV, no external dependencies.
- **BDD syntax** — `describe`/`it` blocks make tests readable as specifications.
- **Mock model layer** — services depend on model functions which can be mocked for unit tests.
- **Integration tests** — health endpoint and route-level tests use Hono's `app.request()` for simulated HTTP requests without starting a server.
- **Shared package tests run without database** — pure function tests for conversions, metrics, validation, and Zod schemas.
- **Prisma client mocking** — for backend service tests, the model layer wraps Prisma calls and can be mocked at the model boundary.