/**
 * Cron-based job scheduling using Deno.cron().
 * Works in both Deno CLI (local dev) and Deno Deploy (production).
 *
 * Cron jobs are defined at module top-level in cron.ts so Deno Deploy
 * can extract them at deployment time. Dynamic imports inside handlers
 * keep the implementation logic in its existing module.
 */
