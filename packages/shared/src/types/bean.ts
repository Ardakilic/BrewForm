/**
 * Bean and vendor type definitions shared between API and frontend.
 *
 * Beans represent coffee products used in recipes. Vendors are the
 * roasters/shops that supply them.
 */

/**
 * A coffee bean/product entry.
 *
 * Returned by `GET /api/v1/beans` and referenced by recipes via `beanId`.
 */
export interface Bean {
  /** UUID primary key */
  id: string;
  /** Product/commercial name */
  name: string;
  /** Brand name (may differ from vendor) */
  brand: string | null;
  /** FK to the vendor */
  vendorId: string | null;
  /** Name of the roaster */
  roaster: string | null;
  /** Roast level (e.g. "light", "medium", "dark") */
  roastLevel: string | null;
  /** Processing method (e.g. "washed", "natural", "honey") */
  processing: string | null;
  /** Country or region of origin */
  origin: string | null;
  /** Owner — the user who created this bean entry */
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/** A coffee vendor/roaster. */
export interface Vendor {
  /** UUID primary key */
  id: string;
  /** Display name */
  name: string;
  website: string | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
