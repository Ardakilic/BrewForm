import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { eq } from 'drizzle-orm';
import { db } from '@brewform/db';
import { reports, users } from '@brewform/db/schema';
import * as model from './model.ts';

/**
 * create — Insert a new content report. Reports have no soft-delete; they have
 * a status field (default 'pending') that transitions to 'resolved' via
 * `resolve`.
 */
describe('create', { sanitizeOps: false, sanitizeResources: false }, () => {
  let reporterId: string;
  let reportId: string;

  beforeEach(async () => {
    reporterId = crypto.randomUUID();
    reportId = crypto.randomUUID();
    await db.insert(users).values({
      id: reporterId,
      email: `test-${reporterId}@example.com`,
      username: `testuser-${reporterId}`,
      passwordHash: 'hash',
    });
  });

  afterEach(async () => {
    await db.delete(reports).where(eq(reports.id, reportId));
    await db.delete(users).where(eq(users.id, reporterId));
  });

  it('should insert a report row and return it', async () => {
    const result = await model.create(
      reporterId,
      'recipe',
      'some-entity-id',
      'Spam content',
    );
    reportId = result.id;
    expect(result).not.toBeNull();
    expect(result.reporterId).toBe(reporterId);
    expect(result.entityType).toBe('recipe');
    expect(result.entityId).toBe('some-entity-id');
    expect(result.reason).toBe('Spam content');
    expect(result.status).toBe('pending');
    expect(result.createdAt).toBeDefined();
    const [row] = await db.select().from(reports).where(eq(reports.id, result.id));
    expect(row.reason).toBe('Spam content');
  });
});

/**
 * findById — Find a report by ID. Returns null if no report with the given ID
 * exists. Reports have no soft-delete, so no deletedAt filter is applied.
 */
describe('findById', { sanitizeOps: false, sanitizeResources: false }, () => {
  let reporterId: string;
  let reportId: string;

  beforeEach(async () => {
    reporterId = crypto.randomUUID();
    reportId = crypto.randomUUID();
    await db.insert(users).values({
      id: reporterId,
      email: `test-${reporterId}@example.com`,
      username: `testuser-${reporterId}`,
      passwordHash: 'hash',
    });
    await db.insert(reports).values({
      id: reportId,
      reporterId,
      entityType: 'comment',
      entityId: 'comment-entity-id',
      reason: 'Harassment',
    });
  });

  afterEach(async () => {
    await db.delete(reports).where(eq(reports.id, reportId));
    await db.delete(users).where(eq(users.id, reporterId));
  });

  it('should return a report by ID', async () => {
    const result = await model.findById(reportId);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(reportId);
    expect(result!.reporterId).toBe(reporterId);
    expect(result!.entityType).toBe('comment');
    expect(result!.reason).toBe('Harassment');
    expect(result!.status).toBe('pending');
  });

  it('should return null for a non-existent report ID', async () => {
    const result = await model.findById('nonexistent-uuid');
    expect(result).toBeNull();
  });
});

/**
 * findMany — List reports with an optional status filter and pagination.
 * Returns `{ reports, total }`. Ordered by createdAt desc.
 */
describe('findMany', { sanitizeOps: false, sanitizeResources: false }, () => {
  let reporterId: string;
  let reportIds: string[];

  beforeEach(async () => {
    reporterId = crypto.randomUUID();
    reportIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    await db.insert(users).values({
      id: reporterId,
      email: `test-${reporterId}@example.com`,
      username: `testuser-${reporterId}`,
      passwordHash: 'hash',
    });
    await db.insert(reports).values([
      {
        id: reportIds[0],
        reporterId,
        entityType: 'recipe',
        entityId: 'e1',
        reason: 'Spam 1',
        status: 'pending',
      },
      {
        id: reportIds[1],
        reporterId,
        entityType: 'comment',
        entityId: 'e2',
        reason: 'Spam 2',
        status: 'resolved',
      },
      {
        id: reportIds[2],
        reporterId,
        entityType: 'user',
        entityId: 'e3',
        reason: 'Spam 3',
        status: 'pending',
      },
    ]);
  });

  afterEach(async () => {
    for (const id of reportIds) {
      await db.delete(reports).where(eq(reports.id, id));
    }
    await db.delete(users).where(eq(users.id, reporterId));
  });

  it('should return all reports for this reporter when no status filter is applied', async () => {
    // Filter to our test rows via the reporterId equality — CI DB has seed data.
    const all = await model.findMany(undefined, 1, 100);
    const ours = all.reports.filter((r) => reportIds.includes(r.id));
    expect(ours.length).toBe(3);
    expect(all.total).toBeGreaterThanOrEqual(3);
  });

  it('should filter by status=pending', async () => {
    const result = await model.findMany('pending', 1, 100);
    const ours = result.reports.filter((r) => reportIds.includes(r.id));
    expect(ours.length).toBe(2);
    for (const r of ours) {
      expect(r.status).toBe('pending');
    }
  });

  it('should filter by status=resolved', async () => {
    const result = await model.findMany('resolved', 1, 100);
    const ours = result.reports.filter((r) => reportIds.includes(r.id));
    expect(ours.length).toBe(1);
    expect(ours[0].id).toBe(reportIds[1]);
    expect(ours[0].status).toBe('resolved');
  });

  it('should return { reports, total } shape', async () => {
    const result = await model.findMany(undefined, 1, 10);
    expect(Object.keys(result).sort()).toEqual(['reports', 'total'].sort());
  });

  it('should paginate correctly', async () => {
    // Use the status=pending filter to scope to our two pending rows plus any
    // seed pending rows; assert pagination cap behaviour (seed-safe).
    const page1 = await model.findMany('pending', 1, 1);
    expect(page1.reports.length).toBe(1);
    expect(page1.total).toBeGreaterThanOrEqual(2);
  });
});

/**
 * resolve — Resolve a report by an admin, setting status to 'resolved' with the
 * resolver's user ID and a resolvedAt timestamp. Returns the updated row, or
 * null if no report with the given ID exists.
 */
describe('resolve', { sanitizeOps: false, sanitizeResources: false }, () => {
  let reporterId: string;
  let resolverId: string;
  let reportId: string;

  beforeEach(async () => {
    reporterId = crypto.randomUUID();
    resolverId = crypto.randomUUID();
    reportId = crypto.randomUUID();
    await db.insert(users).values([
      {
        id: reporterId,
        email: `test-${reporterId}@example.com`,
        username: `testuser-${reporterId}`,
        passwordHash: 'hash',
      },
      {
        id: resolverId,
        email: `test-${resolverId}@example.com`,
        username: `testuser-${resolverId}`,
        passwordHash: 'hash',
      },
    ]);
    await db.insert(reports).values({
      id: reportId,
      reporterId,
      entityType: 'recipe',
      entityId: 'some-entity',
      reason: 'Pending report',
    });
  });

  afterEach(async () => {
    await db.delete(reports).where(eq(reports.id, reportId));
    await db.delete(users).where(eq(users.id, reporterId));
    await db.delete(users).where(eq(users.id, resolverId));
  });

  it('should set status to resolved, resolvedBy, and resolvedAt', async () => {
    const result = await model.resolve(reportId, resolverId);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(reportId);
    expect(result!.status).toBe('resolved');
    expect(result!.resolvedBy).toBe(resolverId);
    expect(result!.resolvedAt).not.toBeNull();
    const [row] = await db.select().from(reports).where(eq(reports.id, reportId));
    expect(row.status).toBe('resolved');
    expect(row.resolvedBy).toBe(resolverId);
    expect(row.resolvedAt).not.toBeNull();
  });

  it('should return null for a non-existent report ID', async () => {
    const result = await model.resolve('nonexistent-uuid', resolverId);
    expect(result).toBeNull();
  });
});
