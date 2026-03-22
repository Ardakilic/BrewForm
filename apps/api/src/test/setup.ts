/**
 * BrewForm Test Setup
 * Shared helpers for Deno native tests.
 * Module-level mocks are handled via src/test/import_map.json.
 */

import { mockFn, type MockFn } from './mock-fn.ts';

export { mockFn, type MockFn };

export interface MockPrismaUser {
  findUnique: MockFn;
  findFirst: MockFn;
  create: MockFn;
  update: MockFn;
  count?: MockFn;
  findMany?: MockFn;
}

export interface MockPrisma {
  $on: MockFn;
  $disconnect: MockFn;
  user: MockPrismaUser;
  session: {
    create: MockFn;
    findFirst: MockFn;
    findUnique: MockFn;
    deleteMany: MockFn;
    update: MockFn;
  };
  passwordReset: {
    create: MockFn;
    findFirst: MockFn;
    findUnique: MockFn;
    update: MockFn;
    updateMany: MockFn;
    delete: MockFn;
  };
  emailVerification: {
    create: MockFn;
    findFirst: MockFn;
    findUnique: MockFn;
    update: MockFn;
    delete: MockFn;
  };
}

export function createMockPrisma(): MockPrisma {
  return {
    $on: mockFn(),
    $disconnect: mockFn(() => Promise.resolve()),
    user: {
      findUnique: mockFn(() => Promise.resolve(null)),
      findFirst: mockFn(() => Promise.resolve(null)),
      create: mockFn(() => Promise.resolve(null)),
      update: mockFn(() => Promise.resolve(null)),
    },
    session: {
      create: mockFn(() => Promise.resolve(null)),
      findFirst: mockFn(() => Promise.resolve(null)),
      findUnique: mockFn(() => Promise.resolve(null)),
      deleteMany: mockFn(() => Promise.resolve({ count: 0 })),
      update: mockFn(() => Promise.resolve(null)),
    },
    passwordReset: {
      create: mockFn(() => Promise.resolve(null)),
      findFirst: mockFn(() => Promise.resolve(null)),
      findUnique: mockFn(() => Promise.resolve(null)),
      update: mockFn(() => Promise.resolve(null)),
      updateMany: mockFn(() => Promise.resolve({ count: 0 })),
      delete: mockFn(() => Promise.resolve(null)),
    },
    emailVerification: {
      create: mockFn(() => Promise.resolve(null)),
      findFirst: mockFn(() => Promise.resolve(null)),
      findUnique: mockFn(() => Promise.resolve(null)),
      update: mockFn(() => Promise.resolve(null)),
      delete: mockFn(() => Promise.resolve(null)),
    },
  };
}
