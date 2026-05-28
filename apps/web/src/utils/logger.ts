/// <reference types="vite/client" />

import type { ChildLogger, CreateLogger } from '@brewform/shared/logger';

const LEVELS: Record<string, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

const logLevel = (import.meta.env.VITE_LOG_LEVEL as string) || 'info';

/** Safe serializer that preserves Error details and avoids circular reference crashes. */
function safeSerialize(obj: Record<string, unknown>): string {
  try {
    const seen = new WeakSet<object>();
    return JSON.stringify(obj, (_key: string, value: unknown) => {
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack,
          ...Object.fromEntries(
            Object.entries(value).filter(([k]) => k !== 'name' && k !== 'message' && k !== 'stack'),
          ),
        };
      }
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return '[Circular]';
        seen.add(value);
      }
      return value;
    });
  } catch {
    return '"[Unserializable object]"';
  }
}

/** Browser console-based logger implementing the shared Logger interface. Filters output by configured log level. */
class ConsoleLogger implements ChildLogger {
  #module: string;
  #level: number;

  constructor(module: string, level: string) {
    this.#module = module;
    this.#level = LEVELS[level] ?? LEVELS.info;
  }

  #shouldLog(level: number): boolean {
    return level >= this.#level;
  }

  #format(obj: Record<string, unknown> | undefined, msg: string): string {
    const prefix = `[${this.#module}]`;
    if (obj && Object.keys(obj).length > 0) {
      return `${prefix} ${msg} ${safeSerialize(obj)}`;
    }
    return `${prefix} ${msg}`;
  }

  info(msg: string): void;
  info(obj: Record<string, unknown>, msg: string): void;
  info(objOrMsg: Record<string, unknown> | string, msg?: string): void {
    if (!this.#shouldLog(LEVELS.info)) return;
    const [obj, message] = typeof objOrMsg === 'string' ? [undefined, objOrMsg] : [objOrMsg, msg!];
    console.info(this.#format(obj, message));
  }

  debug(msg: string): void;
  debug(obj: Record<string, unknown>, msg: string): void;
  debug(objOrMsg: Record<string, unknown> | string, msg?: string): void {
    if (!this.#shouldLog(LEVELS.debug)) return;
    const [obj, message] = typeof objOrMsg === 'string' ? [undefined, objOrMsg] : [objOrMsg, msg!];
    console.debug(this.#format(obj, message));
  }

  trace(msg: string): void;
  trace(obj: Record<string, unknown>, msg: string): void;
  trace(objOrMsg: Record<string, unknown> | string, msg?: string): void {
    if (!this.#shouldLog(LEVELS.trace)) return;
    const [obj, message] = typeof objOrMsg === 'string' ? [undefined, objOrMsg] : [objOrMsg, msg!];
    console.trace(this.#format(obj, message));
  }

  warn(msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  warn(objOrMsg: Record<string, unknown> | string, msg?: string): void {
    if (!this.#shouldLog(LEVELS.warn)) return;
    const [obj, message] = typeof objOrMsg === 'string' ? [undefined, objOrMsg] : [objOrMsg, msg!];
    console.warn(this.#format(obj, message));
  }

  error(msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
  error(objOrMsg: Record<string, unknown> | string, msg?: string): void {
    if (!this.#shouldLog(LEVELS.error)) return;
    const [obj, message] = typeof objOrMsg === 'string' ? [undefined, objOrMsg] : [objOrMsg, msg!];
    console.error(this.#format(obj, message));
  }

  fatal(msg: string): void;
  fatal(obj: Record<string, unknown>, msg: string): void;
  fatal(objOrMsg: Record<string, unknown> | string, msg?: string): void {
    if (!this.#shouldLog(LEVELS.fatal)) return;
    const [obj, message] = typeof objOrMsg === 'string' ? [undefined, objOrMsg] : [objOrMsg, msg!];
    console.error(this.#format(obj, message));
  }

  bindings(): Record<string, unknown> {
    return { module: this.#module };
  }
}

/**
 * Create a module-scoped child logger.
 * @param module - Module name for log prefix and bindings.
 * @returns ChildLogger instance.
 */
export const createLogger: CreateLogger = (module: string) => {
  return new ConsoleLogger(module, logLevel);
};

/** Default application-level logger instance. */
const logger = new ConsoleLogger('app', logLevel);
export default logger;
