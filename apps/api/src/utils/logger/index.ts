import type { ChildLogger, CreateLogger, Logger } from '@brewform/shared/logger';
import pino from 'pino';
import { config } from '../../config/index.ts';

const logger: Logger = pino({
  level: config.LOG_LEVEL || (config.APP_ENV === 'development' ? 'debug' : 'info'),
  redact: ['*.passwordHash', '*.password', '*.token', '*.secret', '*.apiKey', '*.authorization'],
  serializers: {
    err: pino.stdSerializers.err,
  },
  transport: config.LOG_FORMAT === 'pretty'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
    : undefined,
});

/**
 * Create a child logger tagged with a `module` field. All children share the
 * single root pino instance (level, redaction, and transport from config).
 */
export const createLogger: CreateLogger = (module: string) => {
  return logger.child({ module }) as ChildLogger;
};

export { logger };
