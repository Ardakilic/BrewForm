/**
 * Test helpers for simulating client addresses in `app.request()` tests.
 *
 * `@hono/node-server` 2.1.6's `getConnInfo(c)` reads
 * `(c.env.server ?? c.env).incoming.socket.{remoteAddress, remotePort, remoteFamily}`
 * (see `node_modules/@hono/node-server/dist/conninfo.mjs`). In-process
 * `app.request(path, init, env)` calls have no socket, so tests pass this
 * shape as the third (`env`) argument to give each simulated client its own
 * TCP peer address, instead of the spoofable `X-Forwarded-For` header.
 */
import { isIP } from 'node:net';

/** The `app.request()` env shape that `getConnInfo` reads the TCP peer from. */
export interface PeerEnv {
  incoming: {
    socket: {
      remoteAddress: string;
      remotePort: number;
      remoteFamily: 'IPv4' | 'IPv6';
    };
  };
}

/**
 * Build the `app.request()` env for a request arriving from TCP peer `ip`.
 *
 * @param ip - The simulated socket peer address (IPv4 or IPv6).
 * @returns The env object to pass as `app.request(path, init, peerEnv(ip))`.
 */
export function peerEnv(ip: string): PeerEnv {
  return {
    incoming: {
      socket: {
        remoteAddress: ip,
        remotePort: 54321,
        remoteFamily: isIP(ip) === 6 ? 'IPv6' : 'IPv4',
      },
    },
  };
}

/**
 * A fresh, unique documentation-range IPv4 address (198.18.0.0/15, the
 * benchmarking range) for tests that need one simulated client per case.
 *
 * @returns An address such as `198.18.12.34`, never repeated within a process.
 */
export function uniqueTestIp(): string {
  uniqueCounter += 1;
  const n = uniqueCounter;
  return `198.${18 + ((n >> 16) & 1)}.${(n >> 8) & 255}.${n & 255}`;
}

let uniqueCounter = 0;
