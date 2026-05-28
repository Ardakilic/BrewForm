/** Generate a lightweight UUID-like string when crypto.randomUUID is unavailable. */
function generateFallbackId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${
    Math.random().toString(36).slice(2, 10)
  }`;
}

/** Per-page-load session identifier used for request tracing via X-Request-ID header. */
export const sessionId: string = (() => {
  try {
    if (typeof crypto?.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // fall through
  }
  return generateFallbackId();
})();
