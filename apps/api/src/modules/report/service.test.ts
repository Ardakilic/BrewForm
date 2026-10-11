import '../../test-setup.ts';
import { db } from '@brewform/db';
import { reports, users } from '@brewform/db/schema';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createReport, listReports, log, resolveReport } from './service.ts';

describe('Report Service Logic', () => {
  let reporterId: string;
  let resolverId: string;
  let entityId: string;

  function setupSpies() {
    return {
      info: vi.spyOn(log, 'info'),
      debug: vi.spyOn(log, 'debug'),
      warn: vi.spyOn(log, 'warn'),
      error: vi.spyOn(log, 'error'),
    };
  }

  function restoreSpies(spies: ReturnType<typeof setupSpies>) {
    spies.info.mockRestore();
    spies.debug.mockRestore();
    spies.warn.mockRestore();
    spies.error.mockRestore();
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
    it('logs debug entry and exit', async () => {
      const spies = setupSpies();
      try {
        const result = await createReport(reporterId, 'recipe', entityId, 'Spam content');

        expect(result.reporterId).toBe(reporterId);
        expect(result.entityType).toBe('recipe');

        expect(spies.debug).toHaveBeenCalledTimes(2);
        expect(spies.debug).toHaveBeenNthCalledWith(
          1,
          { reporterId, entityType: 'recipe', entityId },
          'createReport started',
        );
        expect(spies.debug).toHaveBeenNthCalledWith(
          2,
          { reporterId, entityType: 'recipe', entityId, reportId: result.id },
          'createReport completed',
        );
        expect(spies.info).toHaveBeenCalledTimes(0);
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
        expect(spies.debug).toHaveBeenCalledTimes(2);
        expect(spies.debug).toHaveBeenNthCalledWith(
          1,
          { status: 'pending', page: 1, perPage: 10 },
          'listReports started',
        );
        expect(spies.debug).toHaveBeenNthCalledWith(
          2,
          { status: 'pending', page: 1, perPage: 10, total: 1 },
          'listReports completed',
        );
      } finally {
        restoreSpies(spies);
      }
    });
  });

  describe('resolveReport', () => {
    it('logs debug entry and exit on success', async () => {
      const report = await createReport(reporterId, 'recipe', entityId, 'Spam content');

      const spies = setupSpies();
      try {
        const result = await resolveReport(report.id, resolverId);

        expect(result.status).toBe('resolved');
        expect(spies.debug).toHaveBeenCalledTimes(2);
        expect(spies.debug).toHaveBeenNthCalledWith(
          1,
          { id: report.id, resolvedBy: resolverId },
          'resolveReport started',
        );
        expect(spies.debug).toHaveBeenNthCalledWith(
          2,
          { id: report.id, resolvedBy: resolverId },
          'resolveReport completed',
        );
        expect(spies.info).toHaveBeenCalledTimes(0);
      } finally {
        restoreSpies(spies);
      }
    });

    it('logs error when report is not found', async () => {
      const missingId = crypto.randomUUID();
      const spies = setupSpies();
      try {
        await expect(resolveReport(missingId, resolverId)).rejects.toThrow('REPORT_NOT_FOUND');

        expect(spies.error).toHaveBeenCalledTimes(1);
        const errArg = spies.error.mock.calls[0][0] as {
          err: Error;
          id: string;
          resolvedBy: string;
        };
        expect(errArg.err).toBeInstanceOf(Error);
        expect(errArg.err.message).toBe('REPORT_NOT_FOUND');
        expect(errArg.id).toBe(missingId);
        expect(errArg.resolvedBy).toBe(resolverId);
        expect(spies.error.mock.calls[0][1]).toBe('resolveReport failed: report not found');
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

        expect(spies.warn).toHaveBeenCalledTimes(1);
        expect(spies.warn).toHaveBeenNthCalledWith(
          1,
          { id: report.id, resolvedBy: resolverId },
          'resolveReport failed: report already resolved',
        );
      } finally {
        restoreSpies(spies);
      }
    });
  });
});
