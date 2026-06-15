import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { assertSpyCallArgs, assertSpyCalls, spy } from 'jsr:@std/testing/mock';
import { eq } from 'drizzle-orm';
import { db } from '@brewform/db';
import { reports, users } from '@brewform/db/schema';
import { createReport, listReports, log, resolveReport } from './service.ts';

describe('Report Service Logic', { sanitizeOps: false, sanitizeResources: false }, () => {
  let reporterId: string;
  let resolverId: string;
  let entityId: string;

  function setupSpies() {
    return {
      info: spy(log, 'info'),
      debug: spy(log, 'debug'),
      warn: spy(log, 'warn'),
      error: spy(log, 'error'),
    };
  }

  function restoreSpies(
    spies: ReturnType<typeof setupSpies>,
  ) {
    spies.info.restore();
    spies.debug.restore();
    spies.warn.restore();
    spies.error.restore();
  }

  function createUser(id: string) {
    return db.insert(users).values({
      id,
      email: `report-test-${id}@example.com`,
      username: `report-test-${id}`,
      passwordHash: 'hash',
    });
  }

  beforeEach(async () => {
    reporterId = crypto.randomUUID();
    resolverId = crypto.randomUUID();
    entityId = crypto.randomUUID();

    await createUser(reporterId);
    await createUser(resolverId);
  });

  afterEach(async () => {
    await db.delete(reports).where(eq(reports.reporterId, reporterId));
    await db.delete(users).where(eq(users.id, reporterId));
    await db.delete(users).where(eq(users.id, resolverId));
  });

  describe('createReport', () => {
    it('logs info entry and exit', async () => {
      const spies = setupSpies();
      try {
        const result = await createReport(reporterId, 'recipe', entityId, 'Spam content');

        expect(result.reporterId).toBe(reporterId);
        expect(result.entityType).toBe('recipe');

        assertSpyCalls(spies.info, 2);
        assertSpyCallArgs(spies.info, 0, [
          { reporterId, entityType: 'recipe', entityId },
          'createReport started',
        ]);
        assertSpyCallArgs(spies.info, 1, [
          { reporterId, entityType: 'recipe', entityId, reportId: result.id },
          'createReport completed',
        ]);
      } finally {
        restoreSpies(spies);
      }
    });
  });

  describe('listReports', () => {
    it('logs debug entry and exit', async () => {
      await createReport(reporterId, 'recipe', entityId, 'Spam content');

      const spies = setupSpies();
      try {
        const result = await listReports('pending', 1, 10);

        expect(result.total).toBe(1);
        assertSpyCalls(spies.debug, 2);
        assertSpyCallArgs(spies.debug, 0, [
          { status: 'pending', page: 1, perPage: 10 },
          'listReports started',
        ]);
        assertSpyCallArgs(spies.debug, 1, [
          { status: 'pending', page: 1, perPage: 10, total: 1 },
          'listReports completed',
        ]);
      } finally {
        restoreSpies(spies);
      }
    });
  });

  describe('resolveReport', () => {
    it('logs info entry and exit on success', async () => {
      const report = await createReport(reporterId, 'recipe', entityId, 'Spam content');

      const spies = setupSpies();
      try {
        const result = await resolveReport(report.id, resolverId);

        expect(result.status).toBe('resolved');
        assertSpyCalls(spies.info, 2);
        assertSpyCallArgs(spies.info, 0, [
          { id: report.id, resolvedBy: resolverId },
          'resolveReport started',
        ]);
        assertSpyCallArgs(spies.info, 1, [
          { id: report.id, resolvedBy: resolverId },
          'resolveReport completed',
        ]);
      } finally {
        restoreSpies(spies);
      }
    });

    it('logs error when report is not found', async () => {
      const missingId = crypto.randomUUID();
      const spies = setupSpies();
      try {
        await expect(resolveReport(missingId, resolverId)).rejects.toThrow('REPORT_NOT_FOUND');

        assertSpyCalls(spies.error, 1);
        assertSpyCallArgs(spies.error, 0, [
          { id: missingId, resolvedBy: resolverId },
          'resolveReport failed: report not found',
        ]);
      } finally {
        restoreSpies(spies);
      }
    });

    it('logs warn when report is already resolved', async () => {
      const report = await createReport(reporterId, 'recipe', entityId, 'Spam content');
      await resolveReport(report.id, resolverId);

      const spies = setupSpies();
      try {
        await expect(resolveReport(report.id, resolverId)).rejects.toThrow(
          'REPORT_ALREADY_RESOLVED',
        );

        assertSpyCalls(spies.warn, 1);
        assertSpyCallArgs(spies.warn, 0, [
          { id: report.id, resolvedBy: resolverId },
          'resolveReport failed: report already resolved',
        ]);
      } finally {
        restoreSpies(spies);
      }
    });
  });
});
