import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import pino from 'pino';

import { createLogger, logger } from './index.ts';
import { config } from '../../config/index.ts';

const REDACT_PATHS = [
  '*.passwordHash',
  '*.password',
  '*.token',
  '*.secret',
  '*.apiKey',
  '*.authorization',
];

function captureOutput() {
  const chunks: string[] = [];
  return {
    stream: {
      write(chunk: Uint8Array | string): boolean {
        chunks.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
        return true;
      },
      end(): void {},
    },
    getOutput: () => chunks.join(''),
  };
}

describe('Logger', () => {
  describe('module shape', () => {
    it('exports createLogger as a function', () => {
      expect(typeof createLogger).toBe('function');
    });

    it('exports logger as an object', () => {
      expect(typeof logger).toBe('object');
      expect(logger).not.toBeNull();
    });

    it('logger has expected pino logging methods', () => {
      for (const method of ['info', 'error', 'warn', 'debug', 'trace', 'fatal'] as const) {
        expect(typeof logger[method]).toBe('function');
      }
    });
  });

  describe('logger configuration', () => {
    it('has a level property that is a string', () => {
      expect(typeof logger.level).toBe('string');
    });

    it('level is set from config.LOG_LEVEL when provided', () => {
      expect(logger.level).toBe(config.LOG_LEVEL);
    });

    it('falls back to debug in development when LOG_LEVEL is not set', () => {
      if (config.APP_ENV === 'development' && !Deno.env.get('LOG_LEVEL')) {
        expect(logger.level).toBe('debug');
      }
    });

    it('falls back to info in production when LOG_LEVEL is not set', () => {
      if (config.APP_ENV === 'production' && !Deno.env.get('LOG_LEVEL')) {
        expect(logger.level).toBe('info');
      }
    });
  });

  describe('redaction', () => {
    it('redacts nested password fields', async () => {
      const { stream, getOutput } = captureOutput();
      const l = pino({ redact: REDACT_PATHS }, stream);
      l.info({ user: { password: 'secret123' } }, 'test');
      await new Promise((r) => setTimeout(r, 50));
      expect(getOutput()).toContain('[Redacted]');
      expect(getOutput()).not.toContain('secret123');
    });

    it('redacts nested passwordHash fields', async () => {
      const { stream, getOutput } = captureOutput();
      const l = pino({ redact: REDACT_PATHS }, stream);
      l.info({ user: { passwordHash: 'hash123' } }, 'test');
      await new Promise((r) => setTimeout(r, 50));
      expect(getOutput()).toContain('[Redacted]');
      expect(getOutput()).not.toContain('hash123');
    });

    it('redacts nested token fields', async () => {
      const { stream, getOutput } = captureOutput();
      const l = pino({ redact: REDACT_PATHS }, stream);
      l.info({ auth: { token: 'jwt-token-abc' } }, 'test');
      await new Promise((r) => setTimeout(r, 50));
      expect(getOutput()).toContain('[Redacted]');
      expect(getOutput()).not.toContain('jwt-token-abc');
    });

    it('redacts nested secret fields', async () => {
      const { stream, getOutput } = captureOutput();
      const l = pino({ redact: REDACT_PATHS }, stream);
      l.info({ app: { secret: 'my-secret' } }, 'test');
      await new Promise((r) => setTimeout(r, 50));
      expect(getOutput()).toContain('[Redacted]');
      expect(getOutput()).not.toContain('my-secret');
    });

    it('redacts nested apiKey fields', async () => {
      const { stream, getOutput } = captureOutput();
      const l = pino({ redact: REDACT_PATHS }, stream);
      l.info({ service: { apiKey: 'key-123' } }, 'test');
      await new Promise((r) => setTimeout(r, 50));
      expect(getOutput()).toContain('[Redacted]');
      expect(getOutput()).not.toContain('key-123');
    });

    it('redacts nested authorization fields', async () => {
      const { stream, getOutput } = captureOutput();
      const l = pino({ redact: REDACT_PATHS }, stream);
      l.info({ headers: { authorization: 'Bearer xyz' } }, 'test');
      await new Promise((r) => setTimeout(r, 50));
      expect(getOutput()).toContain('[Redacted]');
      expect(getOutput()).not.toContain('Bearer xyz');
    });

    it('does not redact non-sensitive fields', async () => {
      const { stream, getOutput } = captureOutput();
      const l = pino({ redact: REDACT_PATHS }, stream);
      l.info({ user: { name: 'admin', email: 'admin@test.com' } }, 'test');
      await new Promise((r) => setTimeout(r, 50));
      expect(getOutput()).toContain('admin');
      expect(getOutput()).toContain('admin@test.com');
    });

    it('redacts multiple sensitive fields in one log entry', async () => {
      const { stream, getOutput } = captureOutput();
      const l = pino({ redact: REDACT_PATHS }, stream);
      l.info(
        { user: { password: 'pass', token: 'tok', apiKey: 'key' } },
        'test',
      );
      await new Promise((r) => setTimeout(r, 50));
      const output = getOutput();
      expect(output).not.toContain('"pass"');
      expect(output).not.toContain('"tok"');
      expect(output).not.toContain('"key"');
      const redactedCount = (output.match(/\[Redacted\]/g) || []).length;
      expect(redactedCount).toBe(3);
    });
  });

  describe('createLogger', () => {
    it('returns a child logger', () => {
      const child = createLogger('test-module');
      expect(child).toBeDefined();
      expect(typeof child.info).toBe('function');
      expect(typeof child.error).toBe('function');
    });

    it('child logger has the module name in its bindings', () => {
      const child = createLogger('my-module');
      const bindings = child.bindings();
      expect(bindings.module).toBe('my-module');
    });

    it('different module names produce different bindings', () => {
      const auth = createLogger('auth');
      const db = createLogger('db');
      expect(auth.bindings().module).toBe('auth');
      expect(db.bindings().module).toBe('db');
    });

    it('child logger inherits the root logger level', () => {
      const child = createLogger('child');
      expect(child.level).toBe(logger.level);
    });

    it('child logger has expected logging methods', () => {
      const child = createLogger('methods');
      for (const method of ['info', 'error', 'warn', 'debug', 'trace', 'fatal'] as const) {
        expect(typeof child[method]).toBe('function');
      }
    });
  });
});
