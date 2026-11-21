import '../../test-setup.ts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRedisClient, log } from './client.ts';

describe('createRedisClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates an ioredis client with the fast-fail options', () => {
    const client = createRedisClient('redis://:secret@valkey:6379', { lazyConnect: true });
    try {
      expect(client.options).toMatchObject({
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        commandTimeout: 500,
        connectTimeout: 2000,
        lazyConnect: true,
      });
      // ioredis's default reconnect strategy is kept (background reconnects).
      expect(typeof client.options.retryStrategy).toBe('function');
      expect(client.status).toBe('wait');
    } finally {
      client.disconnect();
    }
  });

  it('lets overrides win over the defaults', () => {
    const client = createRedisClient('redis://valkey:6379', {
      lazyConnect: true,
      commandTimeout: 250,
    });
    try {
      expect(client.options.commandTimeout).toBe(250);
      expect(client.options.enableOfflineQueue).toBe(false);
    } finally {
      client.disconnect();
    }
  });

  it('logs error events once per disconnect cycle and never logs the URL', () => {
    const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => undefined);
    const url = 'redis://:super-secret-password@valkey:6379';
    const client = createRedisClient(url, { lazyConnect: true });
    try {
      client.emit('error', new Error('connect ECONNREFUSED'));
      client.emit('error', new Error('connect ECONNREFUSED'));
      client.emit('error', new Error('connect ECONNREFUSED'));
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy.mock.calls[0][0]).toMatchObject({ err: expect.any(Error) });

      client.emit('ready');
      client.emit('error', new Error('Connection is closed.'));
      expect(errorSpy).toHaveBeenCalledTimes(2);

      const logged = JSON.stringify(errorSpy.mock.calls);
      expect(logged).not.toContain('super-secret-password');
      expect(logged).not.toContain(url);
    } finally {
      client.disconnect();
    }
  });
});
