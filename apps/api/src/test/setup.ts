/**
 * BrewForm Test Setup
 * Shared helpers for Deno native tests.
 * Module-level mocks are handled via src/test/import_map.json.
 */

import { type Spy, spy } from '@std/testing/mock';

export { type Spy, spy };

export interface MockPrismaUser {
  findUnique: Spy;
  findFirst: Spy;
  create: Spy;
  update: Spy;
  count?: Spy;
  findMany?: Spy;
}

export interface MockPrisma {
  $on: Spy;
  $disconnect: Spy;
  user: MockPrismaUser;
  session: {
    create: Spy;
    findFirst: Spy;
    findUnique: Spy;
    deleteMany: Spy;
    update: Spy;
  };
  passwordReset: {
    create: Spy;
    findFirst: Spy;
    findUnique: Spy;
    update: Spy;
    updateMany: Spy;
    delete: Spy;
  };
  emailVerification: {
    create: Spy;
    findFirst: Spy;
    findUnique: Spy;
    update: Spy;
    delete: Spy;
  };
}

export function createMockPrisma(): MockPrisma {
  return {
    $on: spy(),
    $disconnect: spy(() => Promise.resolve()),
    user: {
      findUnique: spy(() => Promise.resolve(null)),
      findFirst: spy(() => Promise.resolve(null)),
      create: spy(() => Promise.resolve(null)),
      update: spy(() => Promise.resolve(null)),
    },
    session: {
      create: spy(() => Promise.resolve(null)),
      findFirst: spy(() => Promise.resolve(null)),
      findUnique: spy(() => Promise.resolve(null)),
      deleteMany: spy(() => Promise.resolve({ count: 0 })),
      update: spy(() => Promise.resolve(null)),
    },
    passwordReset: {
      create: spy(() => Promise.resolve(null)),
      findFirst: spy(() => Promise.resolve(null)),
      findUnique: spy(() => Promise.resolve(null)),
      update: spy(() => Promise.resolve(null)),
      updateMany: spy(() => Promise.resolve({ count: 0 })),
      delete: spy(() => Promise.resolve(null)),
    },
    emailVerification: {
      create: spy(() => Promise.resolve(null)),
      findFirst: spy(() => Promise.resolve(null)),
      findUnique: spy(() => Promise.resolve(null)),
      update: spy(() => Promise.resolve(null)),
      delete: spy(() => Promise.resolve(null)),
    },
  };
}
