/**
 * Vitest Test Setup
 * Suppresses known third-party library warnings
 */

// Suppress React defaultProps warnings from BaseUI components
const originalError = console.error;
console.error = (...args: unknown[]) => {
  const message = args[0];
  if (
    typeof message === 'string' &&
    message.includes('Support for defaultProps will be removed')
  ) {
    return;
  }
  originalError.apply(console, args);
};

const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  const message = args[0];
  if (
    typeof message === 'string' &&
    message.includes('Support for defaultProps will be removed')
  ) {
    return;
  }
  originalWarn.apply(console, args);
};
