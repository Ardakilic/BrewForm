/**
 * BrewForm Database Client
 * Prisma client singleton with logging integration
 */

import { PrismaClient } from '@prisma/client';
import { getConfig } from '../../config/index.js';
import { getLogger } from '../logger/index.js';

// Singleton instance
let prismaInstance: PrismaClient | null = null;

/**
 * Get the Prisma client instance (singleton pattern)
 */
export function getPrisma(): PrismaClient {
  if (!prismaInstance) {
    const config = getConfig();
    const logger = getLogger();

    prismaInstance = new PrismaClient({
      log: config.nodeEnv === 'development'
        ? [
            { level: 'query', emit: 'event' },
            { level: 'error', emit: 'event' },
            { level: 'warn', emit: 'event' },
          ]
        : [
            { level: 'error', emit: 'event' },
            { level: 'warn', emit: 'event' },
          ],
    });

    // Log queries in development
    if (config.nodeEnv === 'development') {
      prismaInstance.$on('query' as never, (e: { query: string; params: string; duration: number }) => {
        logger.debug({
          type: 'database',
          operation: 'query',
          query: e.query,
          params: e.params,
          duration: e.duration,
        });
      });
    }

    // Log errors
    prismaInstance.$on('error' as never, (e: { message: string }) => {
      logger.error({
        type: 'database',
        operation: 'error',
        message: e.message,
      });
    });

    // Log warnings
    prismaInstance.$on('warn' as never, (e: { message: string }) => {
      logger.warn({
        type: 'database',
        operation: 'warning',
        message: e.message,
      });
    });

    logger.info('Database client initialized');
  }

  return prismaInstance;
}

/**
 * Disconnect from the database
 */
export async function disconnectDb(): Promise<void> {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = null;
    getLogger().info('Database client disconnected');
  }
}

/**
 * Check database connectivity
 */
export async function checkDbConnection(): Promise<boolean> {
  try {
    const prisma = getPrisma();
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    getLogger().error({
      type: 'database',
      operation: 'health_check',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

/**
 * Soft delete helper - adds deletedAt timestamp
 */
export function softDeleteFilter(
  includeDeleted = false
): { deletedAt: null } | Record<string, never> {
  return includeDeleted ? {} : { deletedAt: null };
}

/**
 * Pagination helper
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginationResult {
  skip: number;
  take: number;
}

export function getPagination(
  params: PaginationParams,
  maxLimit = 100
): PaginationResult {
  const config = getConfig();
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(
    Math.max(1, params.limit || config.defaultPageSize),
    maxLimit
  );

  return {
    skip: (page - 1) * limit,
    take: limit,
  };
}

/**
 * Create pagination metadata
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export function createPaginationMeta(
  page: number,
  limit: number,
  total: number
): PaginationMeta {
  const totalPages = Math.ceil(total / limit);
  
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

export const db = {
  get: getPrisma,
  disconnect: disconnectDb,
  checkConnection: checkDbConnection,
  softDeleteFilter,
  getPagination,
  createPaginationMeta,
};

export default db;
