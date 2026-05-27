import '@testing-library/jest-dom';

// React 19 calls window.reportError for recoverable errors. In Deno + jsdom
// this can crash with "parameter 1 is not of type 'Event'" because Deno's
// web implementation of reportError dispatches through jsdom's EventTarget
// with a plain object instead of an ErrorEvent instance. Override to log.
if (typeof globalThis !== 'undefined') {
  (globalThis as unknown as Record<string, unknown>).reportError = (error: unknown) => {
    console.error(error);
  };
}
