/** Per-page-load session identifier used for request tracing via X-Request-ID header. */
export const sessionId: string = crypto.randomUUID();
