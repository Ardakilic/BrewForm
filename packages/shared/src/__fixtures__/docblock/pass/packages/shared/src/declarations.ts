/** Documented exported constant. */
export const documentedConst = 1;

/** Documented exported function. */
export function documentedFn(): number {
  return documentedConst;
}

/** Documented exported type. */
export type DocumentedType = { id: string };

/**
 * Multi-line docblock on a router-like local, exported below as the default export.
 * The docblock sits on the declaration, not on `export default`.
 */
const router = { name: 'router' };

export default router;
