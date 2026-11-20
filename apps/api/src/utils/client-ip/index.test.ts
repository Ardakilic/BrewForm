import '../../test-setup.ts';
import fc from 'fast-check';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLOUDFLARE_IPV4, CLOUDFLARE_IPV6 } from './cloudflare-ranges.ts';
import {
  getClientIp,
  log,
  normalizeIp,
  rateLimitIpKey,
  resetUntrustedXffWarning,
  type TrustConfig,
} from './index.ts';
import { peerEnv } from './test-helpers.ts';

const NONE: TrustConfig = { mode: 'none', hops: 1, cidrs: [] };
const HOPS1: TrustConfig = { mode: 'hops', hops: 1, cidrs: [] };
const HOPS2: TrustConfig = { mode: 'hops', hops: 2, cidrs: [] };
const CF: TrustConfig = { mode: 'cloudflare', hops: 1, cidrs: [] };

/**
 * Resolve the client IP of one request through a tiny Hono app.
 *
 * @param trust - The trust configuration passed to `getClientIp`.
 * @param peer - The simulated TCP peer, or `null` for no connection info.
 * @param headers - Request headers (forwarding headers under test).
 */
async function ipFor(
  trust: TrustConfig,
  peer: string | null,
  headers: Record<string, string> = {},
): Promise<string | null> {
  const app = new Hono();
  app.get('/ip', (c) => c.json({ ip: getClientIp(c, trust) }));
  const res = await app.request('/ip', { headers }, peer === null ? undefined : peerEnv(peer));
  const body = (await res.json()) as { ip: string | null };
  return body.ip;
}

describe('getClientIp', () => {
  beforeEach(() => {
    resetUntrustedXffWarning();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('none mode', () => {
    it('returns the socket peer and ignores X-Forwarded-For, X-Real-IP and CF-Connecting-IP', async () => {
      vi.spyOn(log, 'warn').mockImplementation(() => {});
      const ip = await ipFor(NONE, '203.0.113.7', {
        'x-forwarded-for': '1.2.3.4',
        'x-real-ip': '5.6.7.8',
        'cf-connecting-ip': '1.1.1.1',
      });
      expect(ip).toBe('203.0.113.7');
    });

    it('normalises an IPv4-mapped peer to IPv4', async () => {
      expect(await ipFor(NONE, '::ffff:203.0.113.7')).toBe('203.0.113.7');
    });

    it('strips an IPv6 zone index and lower-cases the address', async () => {
      expect(await ipFor(NONE, 'FE80::1%eth0')).toBe('fe80::1');
    });

    it('returns null when there is no connection info', async () => {
      expect(await ipFor(NONE, null)).toBeNull();
    });

    it('warns once per process, with empty context, when X-Forwarded-For arrives', async () => {
      const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
      await ipFor(NONE, '203.0.113.7', { 'x-forwarded-for': '9.9.9.9' });
      await ipFor(NONE, '203.0.113.8', { 'x-forwarded-for': '8.8.8.8' });
      expect(warn).toHaveBeenCalledTimes(1);
      const [context, message] = warn.mock.calls[0] as [unknown, string];
      expect(context).toEqual({});
      expect(JSON.stringify(warn.mock.calls)).not.toContain('9.9.9.9');
      expect(message).toContain('TRUST_PROXY');
    });

    it('does not warn when no forwarding header is present', async () => {
      const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
      await ipFor(NONE, '203.0.113.7');
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe('hops mode', () => {
    it('selects the right-most entry after one trusted hop', async () => {
      const ip = await ipFor(HOPS1, '10.0.1.5', {
        'x-forwarded-for': 'attacker, 6.6.6.6, 198.51.100.20',
      });
      expect(ip).toBe('198.51.100.20');
    });

    it('selects the correct entry with two trusted hops', async () => {
      const ip = await ipFor(HOPS2, '10.0.1.5', {
        'x-forwarded-for': '6.6.6.6, 198.51.100.20, 172.70.1.1',
      });
      expect(ip).toBe('198.51.100.20');
    });

    it('drops entries that are not valid IPs before selecting', async () => {
      const ip = await ipFor(HOPS2, '10.0.1.5', {
        'x-forwarded-for': '6.6.6.6, 198.51.100.20, not-an-ip, 172.70.1.1, ',
      });
      expect(ip).toBe('198.51.100.20');
    });

    it('clamps a chain shorter than the hop count to its first entry (the socket when XFF is absent)', async () => {
      expect(await ipFor(HOPS2, '10.0.1.5')).toBe('10.0.1.5');
      expect(await ipFor(HOPS1, '10.0.1.5')).toBe('10.0.1.5');
      expect(await ipFor(HOPS2, '10.0.1.5', { 'x-forwarded-for': '198.51.100.20' })).toBe(
        '198.51.100.20',
      );
    });

    it('normalises the selected entry', async () => {
      const ip = await ipFor(HOPS1, '10.0.1.5', { 'x-forwarded-for': '::FFFF:198.51.100.20' });
      expect(ip).toBe('198.51.100.20');
    });

    it('returns null without connection info even when X-Forwarded-For is present', async () => {
      expect(await ipFor(HOPS1, null, { 'x-forwarded-for': '198.51.100.20' })).toBeNull();
    });

    it('property: prepending arbitrary strings to X-Forwarded-For never changes the result', async () => {
      const printable = fc.stringMatching(/^[\x20-\x7e]{0,40}$/);
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          fc.array(fc.oneof(printable, fc.ipV4(), fc.ipV6()), { maxLength: 6 }),
          fc.array(fc.ipV4(), { minLength: 5, maxLength: 5 }),
          async (hops, prefix, trusted) => {
            // The trusted proxies append exactly `hops` entries; the first of
            // them is the client the outermost trusted proxy saw.
            const suffix = trusted.slice(0, hops);
            const trust: TrustConfig = { mode: 'hops', hops, cidrs: [] };
            const base = await ipFor(trust, '10.0.1.5', { 'x-forwarded-for': suffix.join(', ') });
            const spoofed = await ipFor(trust, '10.0.1.5', {
              'x-forwarded-for': [...prefix, ...suffix].join(', '),
            });
            expect(base).toBe(normalizeIp(suffix[0]));
            expect(spoofed).toBe(base);
          },
        ),
        { numRuns: 150 },
      );
    });
  });

  describe('cloudflare mode', () => {
    it('ignores a forged CF-Connecting-IP when the hop is not a Cloudflare address', async () => {
      const ip = await ipFor(CF, '10.0.1.5', {
        'x-forwarded-for': '198.51.100.99',
        'cf-connecting-ip': '1.1.1.1',
      });
      expect(ip).toBe('198.51.100.99');
    });

    it('honours CF-Connecting-IP when the hop is inside a published Cloudflare IPv4 range', async () => {
      const ip = await ipFor(CF, '10.0.1.5', {
        'x-forwarded-for': '173.245.48.10',
        'cf-connecting-ip': '198.51.100.20',
      });
      expect(ip).toBe('198.51.100.20');
    });

    it('honours CF-Connecting-IP when the hop is inside a published Cloudflare IPv6 range', async () => {
      const ip = await ipFor(CF, '10.0.1.5', {
        'x-forwarded-for': '2606:4700::1',
        'cf-connecting-ip': '2001:DB8::5',
      });
      expect(ip).toBe('2001:db8::5');
    });

    it('honours CF-Connecting-IP when the hop is inside TRUST_PROXY_CIDRS', async () => {
      const trust: TrustConfig = { mode: 'cloudflare', hops: 1, cidrs: ['203.0.113.0/24'] };
      const ip = await ipFor(trust, '10.0.1.5', {
        'x-forwarded-for': '203.0.113.9',
        'cf-connecting-ip': '198.51.100.20',
      });
      expect(ip).toBe('198.51.100.20');
      // Without the extra CIDR the same hop is not trusted.
      expect(
        await ipFor(CF, '10.0.1.5', {
          'x-forwarded-for': '203.0.113.9',
          'cf-connecting-ip': '198.51.100.20',
        }),
      ).toBe('203.0.113.9');
    });

    it('falls back to the hop when CF-Connecting-IP is missing or invalid', async () => {
      expect(await ipFor(CF, '10.0.1.5', { 'x-forwarded-for': '173.245.48.10' })).toBe(
        '173.245.48.10',
      );
      expect(
        await ipFor(CF, '10.0.1.5', {
          'x-forwarded-for': '173.245.48.10',
          'cf-connecting-ip': 'garbage',
        }),
      ).toBe('173.245.48.10');
    });
  });
});

describe('normalizeIp', () => {
  it('trims, strips zones, converts IPv4-mapped (dotted and hex) and lower-cases', () => {
    expect(normalizeIp(' 203.0.113.7 ')).toBe('203.0.113.7');
    expect(normalizeIp('fe80::1%25eth0')).toBe('fe80::1');
    expect(normalizeIp('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(normalizeIp('::ffff:cb00:7107')).toBe('203.0.113.7');
    expect(normalizeIp('2001:DB8::A')).toBe('2001:db8::a');
  });

  it('returns null for empty, missing or invalid input', () => {
    expect(normalizeIp(undefined)).toBeNull();
    expect(normalizeIp(null)).toBeNull();
    expect(normalizeIp('')).toBeNull();
    expect(normalizeIp('unknown')).toBeNull();
    expect(normalizeIp('1.2.3.4:8080')).toBeNull();
  });
});

describe('rateLimitIpKey', () => {
  it('uses the literal unknown bucket for null', () => {
    expect(rateLimitIpKey(null)).toBe('unknown');
  });

  it('keeps IPv4 addresses as they are', () => {
    expect(rateLimitIpKey('203.0.113.7')).toBe('203.0.113.7');
  });

  it('buckets IPv6 addresses by /64', () => {
    expect(rateLimitIpKey('2001:db8:1:2::a')).toBe('2001:db8:1:2::/64');
    expect(rateLimitIpKey('2001:db8:1:2:ffff::b')).toBe('2001:db8:1:2::/64');
    expect(rateLimitIpKey('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(rateLimitIpKey('::1')).toBe('0:0:0:0::/64');
    expect(rateLimitIpKey('64:ff9b:1:2::198.51.100.1')).toBe('64:ff9b:1:2::/64');
  });
});

describe('peerEnv', () => {
  it('makes getClientIp return the simulated peer address', async () => {
    expect(await ipFor(NONE, '198.51.100.42')).toBe('198.51.100.42');
    expect(await ipFor(NONE, '2001:db8::42')).toBe('2001:db8::42');
  });
});

describe('cloudflare-ranges', () => {
  it('lists non-empty, valid IPv4 and IPv6 CIDRs', async () => {
    const { isValidCidr } = await import('../../config/env.ts');
    const { isIP } = await import('node:net');
    expect(CLOUDFLARE_IPV4.length).toBeGreaterThan(0);
    expect(CLOUDFLARE_IPV6.length).toBeGreaterThan(0);
    for (const cidr of CLOUDFLARE_IPV4) {
      expect(isValidCidr(cidr)).toBe(true);
      expect(isIP(cidr.split('/')[0])).toBe(4);
    }
    for (const cidr of CLOUDFLARE_IPV6) {
      expect(isValidCidr(cidr)).toBe(true);
      expect(isIP(cidr.split('/')[0])).toBe(6);
    }
  });
});
