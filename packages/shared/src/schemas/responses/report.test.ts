import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { ReportOutputSchema } from './report.ts';

function wire<T>(payload: T): unknown {
  return JSON.parse(JSON.stringify(payload));
}

describe('ReportOutputSchema', () => {
  it('parses a representative report row and round-trips', () => {
    const payload = {
      id: 'report-1',
      reporterId: 'user-1',
      entityType: 'recipe',
      entityId: 'recipe-1',
      reason: 'Spam',
      status: 'pending',
      resolvedAt: null,
      resolvedBy: null,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    };
    const result = ReportOutputSchema.safeParse(wire(payload));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(wire(payload));
  });

  it('parses a resolved report (populated optional fields)', () => {
    const payload = {
      id: 'report-2',
      reporterId: 'user-1',
      entityType: 'comment',
      entityId: 'comment-1',
      reason: 'Abuse',
      status: 'resolved',
      resolvedAt: '2024-01-02T00:00:00.000Z',
      resolvedBy: 'admin-1',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-02T00:00:00.000Z',
    };
    expect(ReportOutputSchema.safeParse(payload).success).toBe(true);
  });
});
