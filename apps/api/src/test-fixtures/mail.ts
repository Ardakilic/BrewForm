/**
 * Test-only nodemailer error shapes, for asserting that email-send failures are
 * logged without recipient addresses.
 */

/**
 * Build an error shaped like nodemailer's `EENVELOPE` (every recipient refused):
 * the SMTP reply, which echoes the address, is appended to `message` and set as
 * `response`, and the address is listed in `rejected` and
 * `rejectedErrors[].recipient`.
 *
 * @param address - The refused recipient address.
 * @returns The error, with `code: 'EENVELOPE'`, `command: 'RCPT TO'` and `responseCode: 550`.
 */
export function smtpEnvelopeError(address: string): Error {
  const reply = `550 5.1.1 <${address}>: Recipient address rejected`;
  return Object.assign(new Error(`Can't send mail - all recipients were rejected: ${reply}`), {
    code: 'EENVELOPE',
    command: 'RCPT TO',
    responseCode: 550,
    response: reply,
    rejected: [address],
    rejectedErrors: [
      Object.assign(new Error(`Recipient command failed: ${reply}`), { recipient: address }),
    ],
  });
}

/**
 * Whether any argument of any recorded call serialises to text containing `needle`
 * (the error object is serialised the way pino's error serializer sees it: every
 * enumerable property plus `message` and `stack`).
 *
 * @param calls - The `mock.calls` of a logger spy.
 * @param needle - The text that must not appear.
 * @returns `true` when some argument contains `needle`.
 */
export function logCallsContain(calls: unknown[][], needle: string): boolean {
  const replacer = (_key: string, value: unknown) =>
    value instanceof Error ? { ...value, message: value.message, stack: value.stack } : value;
  return calls.some((args) => args.some((arg) => JSON.stringify(arg, replacer)?.includes(needle)));
}
