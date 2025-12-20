/**
 * Prisma Client Re-export
 * Provides direct access to prisma instance for convenience
 */

import { getPrisma } from '../database/index.js';

// Re-export the prisma instance as a getter to avoid initialization issues
export const prisma = getPrisma();

export default prisma;
