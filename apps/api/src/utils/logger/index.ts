/**
 * BrewForm Structured Logger
 * Uses Pino for high-performance JSON logging
 */

import pino, { type Logger, type LoggerOptions } from 'pino';
import { getConfig } from '../../config/index.js';

/**
 * Logger context interface for structured logging
 */
export interface LogContext {
  requestId?: string;
  userId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  duration?: number;
  [key: string]: unknown;
}

/**
 * Create logger options based on configuration
 */
function createLoggerOptions(): LoggerOptions {
  const config = getConfig();
  
  const baseOptions: LoggerOptions = {
    name: config.appName,
    level: config.logLevel,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
      bindings: (bindings) => ({
        pid: bindings.pid,
        host: bindings.hostname,
        env: config.nodeEnv,
      }),
    },
    redact: {
      paths: [
        'password',
        'passwordHash',
        'token',
        'refreshToken',
        'authorization',
        'cookie',
        'req.headers.authorization',
        'req.headers.cookie',
      ],
      censor: '[REDACTED]',
    },
  };

  // Use pretty printing in development
  if (config.logFormat === 'pretty' && config.nodeEnv === 'development') {
    return {
      ...baseOptions,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    };
  }

  return baseOptions;
}

// Singleton logger instance
let loggerInstance: Logger | null = null;

/**
 * Get the logger instance (singleton pattern)
 */
export function getLogger(): Logger {
  if (!loggerInstance) {
    loggerInstance = pino(createLoggerOptions());
  }
  return loggerInstance;
}

/**
 * Create a child logger with additional context
 */
export function createChildLogger(context: LogContext): Logger {
  return getLogger().child(context);
}

/**
 * Log an HTTP request
 */
export function logRequest(
  method: string,
  path: string,
  statusCode: number,
  duration: number,
  context?: LogContext
): void {
  const logger = context ? createChildLogger(context) : getLogger();
  
  const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
  
  logger[level]({
    type: 'http',
    method,
    path,
    statusCode,
    duration,
  });
}

/**
 * Log a database operation
 */
export function logDbOperation(
  operation: string,
  model: string,
  duration: number,
  context?: LogContext
): void {
  const logger = context ? createChildLogger(context) : getLogger();
  
  logger.debug({
    type: 'database',
    operation,
    model,
    duration,
  });
}

/**
 * Log an audit event
 */
export function logAudit(
  action: string,
  entityType: string,
  entityId: string | null,
  userId: string | null,
  context?: LogContext
): void {
  const logger = context ? createChildLogger(context) : getLogger();
  
  logger.info({
    type: 'audit',
    action,
    entityType,
    entityId,
    userId,
  });
}

/**
 * Log a security event
 */
export function logSecurity(
  event: string,
  details: Record<string, unknown>,
  context?: LogContext
): void {
  const logger = context ? createChildLogger(context) : getLogger();
  
  logger.warn({
    type: 'security',
    event,
    ...details,
  });
}

/**
 * Log an error with stack trace
 */
export function logError(
  error: Error,
  message?: string,
  context?: LogContext
): void {
  const logger = context ? createChildLogger(context) : getLogger();
  
  logger.error({
    type: 'error',
    err: {
      message: error.message,
      name: error.name,
      stack: error.stack,
    },
    msg: message || error.message,
  });
}

export const logger = {
  get: getLogger,
  child: createChildLogger,
  request: logRequest,
  db: logDbOperation,
  audit: logAudit,
  security: logSecurity,
  error: logError,
};

export default logger;
