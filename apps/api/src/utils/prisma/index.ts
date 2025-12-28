/**
 * Prisma Client Re-export
 * Provides direct access to prisma instance for convenience
 */

import { getPrisma } from '../database/index.js';

// Re-export getPrisma for lazy initialization (important for testing)
export { getPrisma };

// Lazy getter for prisma instance
export const prisma = new Proxy({} as ReturnType<typeof getPrisma>, {
  get(_target, prop) {
    return getPrisma()[prop as keyof ReturnType<typeof getPrisma>];
  },
});

export default prisma;
