import '@testing-library/jest-dom';

// Tell React 19 it is running in a test environment so act() warnings work.
// Note: This only takes effect in ESM module scope. React 19's CJS development
// bundle uses strict mode, where bare global references (typeof IS_REACT_ACT_ENVIRONMENT)
// do NOT fall through to globalThis. This is a known Deno CJS compat limitation.
// The "not configured to support act()" warning may still appear in some test
// files (e.g., Navbar) where tests explicitly invoke React.act(). This warning
// is benign — all tests pass correctly.
(globalThis as unknown as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// React 19 calls window.reportError for recoverable errors. In Deno + jsdom
// this can crash with "parameter 1 is not of type 'Event'" because Deno's
// web implementation of reportError dispatches through jsdom's EventTarget
// with a plain object instead of an ErrorEvent instance. Override to log.
if (typeof globalThis !== 'undefined') {
  (globalThis as unknown as Record<string, unknown>).reportError = (error: unknown) => {
    console.error(error);
  };
}

// jsdom does not implement navigation, so clicking <a href="..."> elements
// emits a noisy "Not implemented: navigation to another Document" warning.
// Suppress it by preventing default on internal link clicks during tests.
if (typeof globalThis !== 'undefined') {
  globalThis.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const anchor = target.closest('a');
    if (anchor && anchor.getAttribute('href')?.startsWith('/')) {
      event.preventDefault();
    }
  });
}
