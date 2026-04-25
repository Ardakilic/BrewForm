import pino from 'pino';
import { config } from '../../config/index.ts';

const logger = pino({
  level: config.LOG_LEVEL || (config.APP_ENV === 'development' ? 'debug' : 'info'),
  redact: ['*.passwordHash', '*.password', '*.token', '*.secret', '*.apiKey', '*.authorization'],
  serializers: {
    err: pino.stdSerializers.err,
  },
  transport: config.APP_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
    : undefined,
});

export function createLogger(module: string) {
  return logger.child({ module });
}

export { logger };