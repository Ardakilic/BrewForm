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

  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const result = await prisma.$transaction(async (tx: PrismaTx) => {
        const existing = await tx.rateLimit.findUnique({
          where: {
            identifier_action: {
              identifier,
              action,
            },
          },
        }) as { id: string; count: number; windowStart: Date; expiresAt: Date } | null;

        if (existing) {
          const isExpired = existing.windowStart.getTime() < windowStart.getTime();

          if (isExpired) {
            // Window expired, delete and create new
            await tx.rateLimit.delete({ where: { id: existing.id } });
            const expiresAt = new Date(now.getTime() + windowMs);
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
          }

          // Window still active
          if (existing.count >= maxRequests) {
            return {
              allowed: false,
              remaining: 0,
              resetAt: existing.windowStart.getTime() + windowMs,
            };
          }

          // Atomic increment
          await tx.rateLimit.update({
            where: {
              id: existing.id,
            },
            data: {
              count: { increment: 1 },
              // Keep windowStart fixed for the duration of the window
              expiresAt: new Date(existing.windowStart.getTime() + windowMs),
            },
          });

          return {
            allowed: true,
            remaining: maxRequests - existing.count - 1,
            resetAt: existing.windowStart.getTime() + windowMs,
          };
        }

        // No existing record, create new
        const expiresAt = new Date(now.getTime() + windowMs);
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
      // Detect Prisma unique constraint violation via error code P2002
      const isUniqueConstraintError = error instanceof Error &&
        (error as { code?: string }).code === "P2002";

      if (isUniqueConstraintError) {
        attempt++;
        if (attempt >= maxRetries) {
          getLogger().error({
            type: "rate_limit",
            operation: "check",
            error: "Max retries exceeded on unique constraint conflict",
          });

          // Re-read the existing row to compute a correct decision
          try {
            const reReadNow = new Date();
            const reReadWindowStart = new Date(reReadNow.getTime() - windowMs);
            const existing = await prisma.rateLimit.findUnique({
              where: { identifier_action: { identifier, action } },
            });

            if (existing) {
              const isExpired =
                existing.windowStart.getTime() < reReadWindowStart.getTime();
              if (!isExpired && existing.count >= maxRequests) {
                return {
                  allowed: false,
                  remaining: 0,
                  resetAt: existing.windowStart.getTime() + windowMs,
                };
              }
              return {
                allowed: true,
                remaining: Math.max(0, maxRequests - existing.count),
                resetAt: existing.windowStart.getTime() + windowMs,
              };
            }
          } catch {
            // Re-read failed; fall through to conservative deny
          }

          // Conservatively deny when we cannot reliably enforce limits
          return {
            allowed: false,
            remaining: 0,
            resetAt: now.getTime() + windowMs,
          };
        }
        // Retry after brief delay
        await new Promise((resolve) => setTimeout(resolve, 10 * attempt));
        continue;
      }

      getLogger().error({
        type: "rate_limit",
        operation: "check",
        error: error instanceof Error ? error.message : "Unknown error",
      });

      // Conservatively deny on unexpected DB errors to avoid bypassing limits
      return {
        allowed: false,
        remaining: 0,
        resetAt: now.getTime() + windowMs,
      };
    }
  }

  // Fallback: conservatively deny when max retries are exhausted
  return {
    allowed: false,
    remaining: 0,
    resetAt: now.getTime() + windowMs,
  };
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