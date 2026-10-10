import '../../test-setup.ts';
import { afterEach, describe, expect, it } from 'vitest';
import { closeTransporter, getTransporter } from './index.ts';

describe('getTransporter', () => {
  afterEach(() => {
    closeTransporter();
  });

  it('should return the same reference on repeated calls', () => {
    const t1 = getTransporter();
    const t2 = getTransporter();
    expect(t1).toBe(t2);
  });

  it('should create a new instance after closeTransporter()', () => {
    const t1 = getTransporter();
    closeTransporter();
    const t2 = getTransporter();
    expect(t1).not.toBe(t2);
  });
});
