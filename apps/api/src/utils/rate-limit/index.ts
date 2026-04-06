/**
 * BrewForm Rate Limiter (Prisma-based)
 * Database-backed rate limiting using RateLimit model
 */

import { getPrisma } from "../database/index.ts";
import { getLogger } from "../logger/index.ts";

interface PrismaTx {
  rateLimit: {
    findUnique: (args: unknown) => Promise<unknown>;
    create: (args: unknown) => Promise<unknown>;
    update: (args: unknown) => Promise<unknown>;
    delete: (args: unknown) => Promise<unknown>;
  };
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export async function checkRateLimit(
  identifier: string,
  action: string,
  maxRequests: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const prisma = getPrisma();
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);
  const expiresAt = new Date(now.getTime() + windowMs);

  try {
    const result = await prisma.$transaction(async (tx: PrismaTx) => {
      const existing = await tx.rateLimit.findUnique({
        where: {
          identifier_action: {
            identifier,
            action,
          },
        },
      }) as { id: string; count: number; windowStart: Date } | null;

      if (existing) {
        const isExpired =
          existing.windowStart.getTime() < windowStart.getTime();

        if (isExpired) {
          // Window expired — reset the window in place with a new start time
          await tx.rateLimit.update({
            where: { id: existing.id },
            data: {
              count: 1,
              windowStart: now,
              expiresAt,
            },
          });

          return {
            allowed: true,
            remaining: maxRequests - 1,
            resetAt: now.getTime() + windowMs,
          };
        }

        // Within window — deny if limit already reached
        if (existing.count >= maxRequests) {
          return {
            allowed: false,
            remaining: 0,
            resetAt: existing.windowStart.getTime() + windowMs,
          };
        }

        // Atomically increment count at the DB level (fixed window: windowStart unchanged)
        const updated = await tx.rateLimit.update({
          where: { id: existing.id },
          data: { count: { increment: 1 } },
        }) as { count: number; windowStart: Date };

        return {
          allowed: true,
          remaining: maxRequests - updated.count,
          resetAt: updated.windowStart.getTime() + windowMs,
        };
      }

      // No existing record — create new window
      await tx.rateLimit.create({
        data: {
          identifier,
          action,
          count: 1,
          windowStart: now,
          expiresAt,
        },
      });

      return {
        allowed: true,
        remaining: maxRequests - 1,
        resetAt: now.getTime() + windowMs,
      };
    });

    return result;
  } catch (error) {
    getLogger().error({
      type: "rate_limit",
      operation: "check",
      error: error instanceof Error ? error.message : "Unknown error",
    });

    // Fail closed: deny requests on DB errors to prevent abuse during outages
    return {
      allowed: false,
      remaining: 0,
      resetAt: now.getTime() + windowMs,
    };
  }
}

export async function cleanupExpiredRateLimits(): Promise<number> {
  const prisma = getPrisma();

  try {
    const result = await prisma.rateLimit.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    return result.count;
  } catch (error) {
    getLogger().error({
      type: "rate_limit",
      operation: "cleanup",
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return 0;
  }
}

export default {
  checkRateLimit,
  cleanupExpiredRateLimits,
};
