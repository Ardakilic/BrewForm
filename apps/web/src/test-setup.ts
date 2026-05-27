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
