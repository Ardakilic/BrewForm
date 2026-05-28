import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const CONSOLE_METHODS = ['info', 'debug', 'trace', 'warn', 'error'] as const;

function spyOnAllConsole() {
  const spies: Record<string, ReturnType<typeof vi.spyOn>> = {};
  for (const m of CONSOLE_METHODS) {
    spies[m] = vi.spyOn(console, m).mockImplementation(() => {});
  }
  return spies;
}

async function importModule() {
  return await import('./logger.ts');
}

describe('Web Console Logger', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe('Logger creation', () => {
    it('createLogger is a function', async () => {
      const mod = await importModule();
      expect(typeof mod.createLogger).toBe('function');
    });

    it('createLogger returns an object with all expected methods', async () => {
      const mod = await importModule();
      const log = mod.createLogger('test');
      expect(log).toHaveProperty('info');
      expect(log).toHaveProperty('debug');
      expect(log).toHaveProperty('trace');
      expect(log).toHaveProperty('warn');
      expect(log).toHaveProperty('error');
      expect(log).toHaveProperty('fatal');
      expect(log).toHaveProperty('bindings');
    });

    it('Default logger instance exists', async () => {
      const mod = await importModule();
      expect(mod.default).toBeDefined();
    });
  });

  describe('Module binding', () => {
    it('createLogger sets module name in bindings', async () => {
      const mod = await importModule();
      const log = mod.createLogger('my-module');
      expect(log.bindings()).toEqual({ module: 'my-module' });
    });
  });

  describe('Log level filtering', () => {
    it('filters out messages below error level when VITE_LOG_LEVEL=error', async () => {
      vi.stubEnv('VITE_LOG_LEVEL', 'error');
      const mod = await importModule();
      const log = mod.createLogger('test');

      const spies = spyOnAllConsole();

      log.info('filtered');
      log.debug('filtered');
      log.trace('filtered');
      log.warn('filtered');
      log.error('should log');
      log.fatal('should log');

      expect(spies.info).not.toHaveBeenCalled();
      expect(spies.debug).not.toHaveBeenCalled();
      expect(spies.trace).not.toHaveBeenCalled();
      expect(spies.warn).not.toHaveBeenCalled();
      expect(spies.error).toHaveBeenCalledTimes(2);
    });
  });

  describe('Console method mapping', () => {
    it('maps each logger method to the correct console method at trace level', async () => {
      vi.stubEnv('VITE_LOG_LEVEL', 'trace');
      const mod = await importModule();
      const log = mod.createLogger('test');

      const spies = spyOnAllConsole();

      log.info('a');
      log.debug('b');
      log.trace('c');
      log.warn('d');
      log.error('e');
      log.fatal('f');

      expect(spies.info).toHaveBeenCalledOnce();
      expect(spies.debug).toHaveBeenCalledOnce();
      expect(spies.trace).toHaveBeenCalledOnce();
      expect(spies.warn).toHaveBeenCalledOnce();
      expect(spies.error).toHaveBeenCalledTimes(2);
    });

    it('logger.info calls console.info', async () => {
      vi.stubEnv('VITE_LOG_LEVEL', 'trace');
      const mod = await importModule();
      const log = mod.createLogger('test');

      const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
      log.info('msg');
      expect(spy).toHaveBeenCalledWith('[test] msg');
    });

    it('logger.debug calls console.debug', async () => {
      vi.stubEnv('VITE_LOG_LEVEL', 'trace');
      const mod = await importModule();
      const log = mod.createLogger('test');

      const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      log.debug('msg');
      expect(spy).toHaveBeenCalledWith('[test] msg');
    });

    it('logger.trace calls console.trace', async () => {
      vi.stubEnv('VITE_LOG_LEVEL', 'trace');
      const mod = await importModule();
      const log = mod.createLogger('test');

      const spy = vi.spyOn(console, 'trace').mockImplementation(() => {});
      log.trace('msg');
      expect(spy).toHaveBeenCalledWith('[test] msg');
    });

    it('logger.warn calls console.warn', async () => {
      vi.stubEnv('VITE_LOG_LEVEL', 'trace');
      const mod = await importModule();
      const log = mod.createLogger('test');

      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      log.warn('msg');
      expect(spy).toHaveBeenCalledWith('[test] msg');
    });

    it('logger.error calls console.error', async () => {
      vi.stubEnv('VITE_LOG_LEVEL', 'trace');
      const mod = await importModule();
      const log = mod.createLogger('test');

      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      log.error('msg');
      expect(spy).toHaveBeenCalledWith('[test] msg');
    });

    it('logger.fatal calls console.error', async () => {
      vi.stubEnv('VITE_LOG_LEVEL', 'trace');
      const mod = await importModule();
      const log = mod.createLogger('test');

      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      log.fatal('msg');
      expect(spy).toHaveBeenCalledWith('[test] msg');
    });
  });

  describe('Both overloads', () => {
    it('accepts a plain string message', async () => {
      vi.stubEnv('VITE_LOG_LEVEL', 'trace');
      const mod = await importModule();
      const log = mod.createLogger('test');

      const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
      log.info('hello world');
      expect(spy).toHaveBeenCalledWith('[test] hello world');
    });

    it('accepts an object and a string message', async () => {
      vi.stubEnv('VITE_LOG_LEVEL', 'trace');
      const mod = await importModule();
      const log = mod.createLogger('test');

      const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
      log.info({ key: 'value' }, 'context');
      expect(spy).toHaveBeenCalledWith('[test] context {"key":"value"}');
    });
  });
});
