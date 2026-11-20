/**
 * Client IP resolution for rate limiting.
 *
 * The single place that decides which address a request comes from, driven by
 * `TRUST_PROXY` (see the `api-rate-limiting` spec and ADR-016):
 *
 * - `none` (default): the TCP peer from `getConnInfo(c)`; every forwarding
 *   header is ignored. The first request carrying `X-Forwarded-For` logs one
 *   warn per process, because behind a proxy all clients then share a bucket.
 * - `hops`: the chain `[...valid X-Forwarded-For entries, socket peer]`,
 *   indexed at `chain.length - 1 - TRUST_PROXY_HOPS` (clamped to 0). The socket
 *   peer counts as the first trusted proxy, so client-controlled entries on the
 *   left can never change the result.
 * - `cloudflare`: the `hops` candidate, replaced by `CF-Connecting-IP` only when
 *   the candidate is a Cloudflare edge (bundled ranges) or in `TRUST_PROXY_CIDRS`.
 *
 * Addresses are normalised (trimmed, zone stripped, IPv4-mapped IPv6 → IPv4,
 * IPv6 lower-cased) and {@link rateLimitIpKey} buckets IPv6 by /64. A raw
 * header string is never used as a key, and nothing here logs an address.
 */
import { BlockList, isIP } from 'node:net';
import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';
import { config } from '../../config/index.ts';
import { createLogger } from '../logger/index.ts';
import { CLOUDFLARE_IPV4, CLOUDFLARE_IPV6 } from './cloudflare-ranges.ts';

/** Module logger (exported for test spies). Never logs addresses or header values. */
export const log = createLogger('client-ip');

/** Which forwarding information to trust when resolving the client address. */
export interface TrustConfig {
  /** `none` = TCP peer only; `hops` = right-most XFF after N hops; `cloudflare` = verified CF header. */
  mode: 'none' | 'hops' | 'cloudflare';
  /** Number of trusted proxies in front of the API (the socket peer is the first). */
  hops: number;
  /** Extra trusted edge CIDRs for `cloudflare` mode. */
  cidrs: readonly string[];
}

/**
 * Read the trust configuration from the validated environment
 * (`TRUST_PROXY`, `TRUST_PROXY_HOPS`, `TRUST_PROXY_CIDRS`).
 *
 * @returns The current {@link TrustConfig}.
 */
export function trustConfigFromEnv(): TrustConfig {
  return {
    mode: config.TRUST_PROXY,
    hops: config.TRUST_PROXY_HOPS,
    cidrs: config.TRUST_PROXY_CIDRS,
  };
}

/** Set once the `none`-mode X-Forwarded-For hint has been logged in this process. */
let warnedUntrustedXff = false;

/**
 * Re-arm the once-per-process `none`-mode X-Forwarded-For warning.
 * Test-only hook; production code never calls it.
 */
export function resetUntrustedXffWarning(): void {
  warnedUntrustedXff = false;
}

/**
 * Normalise a raw address: trim, strip an IPv6 zone index (`%eth0`), convert
 * IPv4-mapped IPv6 (`::ffff:a.b.c.d` or `::ffff:XXXX:XXXX`) to IPv4 and
 * lower-case IPv6.
 *
 * @param raw - An address from the socket or a forwarding header.
 * @returns The normalised address, or `null` when it is missing or not an IP.
 */
export function normalizeIp(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  let value = raw.trim();
  const zone = value.indexOf('%');
  if (zone !== -1) value = value.slice(0, zone);
  value = value.toLowerCase();
  const family = isIP(value);
  if (family === 4) return value;
  if (family !== 6) return null;

  // IPv4-mapped (::ffff:0:0/96), in dotted or hex form → plain IPv4.
  const groups = ipv6Groups(value);
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    const [high, low] = [groups[6], groups[7]];
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }
  return value;
}

/**
 * Expand a valid IPv6 address into its eight 16-bit groups (handles `::` and an
 * embedded dotted IPv4 tail).
 *
 * @param ip - A normalised IPv6 address.
 * @returns Eight group values.
 */
function ipv6Groups(ip: string): number[] {
  const expandTail = (parts: string[]): string[] =>
    parts.flatMap((part) => {
      if (!part.includes('.')) return [part];
      const [a, b, c, d] = part.split('.').map(Number);
      return [((a << 8) | b).toString(16), ((c << 8) | d).toString(16)];
    });
  const doubleColon = ip.indexOf('::');
  if (doubleColon === -1) return expandTail(ip.split(':')).map((g) => Number.parseInt(g, 16));
  const headText = ip.slice(0, doubleColon);
  const tailText = ip.slice(doubleColon + 2);
  const head = expandTail(headText ? headText.split(':') : []);
  const tail = expandTail(tailText ? tailText.split(':') : []);
  const zeros = new Array<string>(Math.max(0, 8 - head.length - tail.length)).fill('0');
  return [...head, ...zeros, ...tail].map((g) => Number.parseInt(g, 16));
}

/**
 * The client-address component of a rate-limit key.
 *
 * @param ip - A normalised address from {@link getClientIp}, or `null`.
 * @returns `'unknown'` for `null`, the IPv4 address as is, or the IPv6 /64
 *   prefix as `<g1>:<g2>:<g3>:<g4>::/64` (hex groups without leading zeros).
 */
export function rateLimitIpKey(ip: string | null): string {
  if (ip === null) return 'unknown';
  if (isIP(ip) !== 6) return ip;
  const prefix = ipv6Groups(ip)
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(':');
  return `${prefix}::/64`;
}

/** Lazily built Cloudflare + `TRUST_PROXY_CIDRS` block list, keyed by the extra CIDRs. */
let trustedEdges: { key: string; list: BlockList } | null = null;

/**
 * Return the trusted-edge {@link BlockList} for the given extra CIDRs, built on
 * first use (and rebuilt only when the CIDR list changes).
 *
 * @param cidrs - Extra trusted CIDRs (already validated by the env schema).
 * @returns A block list containing the Cloudflare ranges plus `cidrs`.
 */
function trustedEdgeList(cidrs: readonly string[]): BlockList {
  const key = cidrs.join(',');
  if (trustedEdges?.key === key) return trustedEdges.list;
  const list = new BlockList();
  const add = (cidr: string) => {
    const [address, prefix] = cidr.split('/');
    const family = isIP(address);
    if (family === 0 || prefix === undefined) return;
    list.addSubnet(address, Number(prefix), family === 6 ? 'ipv6' : 'ipv4');
  };
  for (const cidr of CLOUDFLARE_IPV4) add(cidr);
  for (const cidr of CLOUDFLARE_IPV6) add(cidr);
  for (const cidr of cidrs) add(cidr);
  trustedEdges = { key, list };
  return list;
}

/**
 * Read and normalise the TCP peer address via `@hono/node-server`'s
 * `getConnInfo`. In-process `app.request()` calls have no socket, which makes
 * `getConnInfo` throw; that case yields `null`.
 *
 * @param c - The Hono request context.
 * @returns The normalised peer address, or `null` when unavailable.
 */
function socketPeer(c: Context): string | null {
  try {
    return normalizeIp(getConnInfo(c).remote.address);
  } catch {
    return null;
  }
}

/**
 * Resolve the client IP of a request according to the trust configuration.
 * Without a socket peer the result is `null` in every mode (no trust anchor),
 * and the limiter then uses the `unknown` bucket.
 *
 * @param c - The Hono request context.
 * @param trust - The trust configuration (defaults to the environment).
 * @returns The normalised client address, or `null` when it cannot be determined.
 */
export function getClientIp(c: Context, trust: TrustConfig = trustConfigFromEnv()): string | null {
  const peer = socketPeer(c);
  const xff = c.req.header('x-forwarded-for');

  if (trust.mode === 'none') {
    if (xff !== undefined && !warnedUntrustedXff) {
      warnedUntrustedXff = true;
      log.warn(
        {},
        'X-Forwarded-For received while TRUST_PROXY=none: all proxied clients may share one rate-limit bucket (set TRUST_PROXY=hops or cloudflare behind a proxy)',
      );
    }
    return peer;
  }

  if (peer === null) return null;

  const entries = (xff ?? '')
    .split(',')
    .map((entry) => normalizeIp(entry))
    .filter((entry): entry is string => entry !== null);
  const chain = [...entries, peer];
  const candidate = chain[Math.max(0, chain.length - 1 - trust.hops)];

  if (trust.mode === 'cloudflare') {
    const family = isIP(candidate) === 6 ? 'ipv6' : 'ipv4';
    if (trustedEdgeList(trust.cidrs).check(candidate, family)) {
      const forwarded = normalizeIp(c.req.header('cf-connecting-ip'));
      if (forwarded !== null) return forwarded;
    }
  }
  return candidate;
}
