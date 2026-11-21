/**
 * Tests for the container health-check probe `apps/api/scripts/healthcheck.mjs`
 * (container-deployment capability, "API runtime image runs as non-root with a built-in
 * health check"). The probe is spawned exactly as the image `HEALTHCHECK` runs it
 * (`node /app/healthcheck.mjs [path]`) against a local `node:http` server whose port is
 * passed through `APP_PORT`.
 */
import { spawn } from 'node:child_process';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/** Absolute path of the probe script. */
const PROBE = fileURLToPath(new URL('../../../scripts/healthcheck.mjs', import.meta.url));

/** Result of one probe run. */
interface ProbeRun {
  code: number | null;
  stderr: string;
  elapsedMs: number;
}

/** Servers started by a test, closed in `afterEach`. */
const servers: Server[] = [];

/**
 * Start a server on an ephemeral 127.0.0.1 port.
 *
 * @param handler - The request handler (may never respond).
 * @returns The server, its port and the request paths it received.
 */
async function startServer(handler: (req: IncomingMessage, res: ServerResponse) => void) {
  const paths: string[] = [];
  const server = createServer((req, res) => {
    paths.push(req.url ?? '');
    handler(req, res);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: (server.address() as AddressInfo).port, paths };
}

/**
 * Spawn the probe asynchronously (the in-process server must keep serving).
 *
 * @param port - The `APP_PORT` value.
 * @param args - Extra arguments (the path).
 */
function runProbe(port: number, args: string[] = []): Promise<ProbeRun> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [PROBE, ...args], {
      env: { ...process.env, APP_PORT: String(port) },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stderr, elapsedMs: Date.now() - started }));
  });
}

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe('healthcheck.mjs', () => {
  it('exits 0 on a 200 response and probes /ready by default', async () => {
    const { port, paths } = await startServer((_req, res) => res.writeHead(200).end('{}'));
    const run = await runProbe(port);
    expect(run.code).toBe(0);
    expect(paths).toEqual(['/ready']);
    expect(run.stderr).toBe('');
  });

  it('probes the path given as the first argument', async () => {
    const { port, paths } = await startServer((_req, res) => res.writeHead(200).end('{}'));
    const run = await runProbe(port, ['/health']);
    expect(run.code).toBe(0);
    expect(paths).toEqual(['/health']);
  });

  it('exits 1 on a 503 response and names the status on one stderr line', async () => {
    const { port } = await startServer((_req, res) =>
      res.writeHead(503).end('{"status":"not_ready","secret":"body-text"}'),
    );
    const run = await runProbe(port);
    expect(run.code).toBe(1);
    expect(run.stderr.trim().split('\n')).toHaveLength(1);
    expect(run.stderr).toContain('503');
    expect(run.stderr).not.toContain('body-text');
  });

  it('exits 1 when the port is closed', async () => {
    const { server, port } = await startServer((_req, res) => res.writeHead(200).end());
    await new Promise<void>((resolve) => server.close(() => resolve()));
    servers.splice(servers.indexOf(server), 1);
    const run = await runProbe(port);
    expect(run.code).toBe(1);
    expect(run.stderr.trim().split('\n')).toHaveLength(1);
  });

  it('exits 1 within 5 s when the server never answers', async () => {
    const { port } = await startServer(() => undefined);
    const run = await runProbe(port);
    expect(run.code).toBe(1);
    expect(run.elapsedMs).toBeLessThan(5000);
    expect(run.stderr).toMatch(/Timeout|Abort/);
  }, 10_000);

  it('exits 1 without any request for an absolute URL argument', async () => {
    const { port, paths } = await startServer((_req, res) => res.writeHead(200).end());
    const run = await runProbe(port, ['http://example.com/']);
    expect(run.code).toBe(1);
    expect(paths).toEqual([]);
  });

  it('rejects path traversal and query strings without a request', async () => {
    const { port, paths } = await startServer((_req, res) => res.writeHead(200).end());
    for (const arg of ['/ready?x=1', '/../etc', '//example.com', 'ready']) {
      expect((await runProbe(port, [arg])).code).toBe(1);
    }
    expect(paths).toEqual([]);
  });
});
