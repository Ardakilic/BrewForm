/** Structured logging interface with leveled methods and child logger support. */
export interface Logger {
  level?: string;
  info(msg: string): void;
  info(obj: Record<string, unknown>, msg: string): void;
  debug(msg: string): void;
  debug(obj: Record<string, unknown>, msg: string): void;
  trace(msg: string): void;
  trace(obj: Record<string, unknown>, msg: string): void;
  warn(msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
  fatal(msg: string): void;
  fatal(obj: Record<string, unknown>, msg: string): void;
  child(bindings: Record<string, unknown>): Logger;
}

/** Logger with module binding introspection. */
export interface ChildLogger extends Logger {
  bindings(): Record<string, unknown>;
}

/** Factory that creates a child logger scoped to a module name. */
export type CreateLogger = (module: string) => ChildLogger;
