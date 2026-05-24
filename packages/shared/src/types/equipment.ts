/**
 * Equipment type definitions shared between API and frontend.
 *
 * Equipment represents brewing tools users can associate with recipes
 * and saved setups. Specialized sub-types (Portafilter, Basket, etc.)
 * extend the base Equipment with type-specific detail fields.
 */

/** Category of brewing equipment. */
export type EquipmentType =
  | 'portafilter'
  | 'basket'
  | 'puck_screen'
  | 'paper_filter'
  | 'tamper'
  | 'gooseneck_kettle'
  | 'mesh_filter'
  | 'cezve'
  | 'scale'
  | 'thermometer'
  | 'other';

/**
 * Base equipment entity returned by equipment endpoints
 * (e.g. `GET /api/v1/equipment`).
 */
export interface Equipment {
  /** UUID primary key */
  id: string;
  /** User-assigned display name */
  name: string;
  /** Equipment category */
  type: EquipmentType;
  /** Manufacturer brand name */
  brand: string | null;
  /** Model name or number */
  model: string | null;
  /** Free-text description */
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/** Portafilter-specific equipment with extended details. */
export interface Portafilter {
  id: string;
  name: string;
  type: 'portafilter';
  brand: string | null;
  /** Additional details (e.g. diameter, bottomless) */
  details: string;
}

/** Basket-specific equipment with extended details. */
export interface Basket {
  id: string;
  name: string;
  type: 'basket';
  brand: string | null;
  /** Additional details (e.g. single/double, ridged/ridgeless) */
  details: string;
}

/** Puck screen-specific equipment with extended details. */
export interface PuckScreen {
  id: string;
  name: string;
  type: 'puck_screen';
  brand: string | null;
  /** Additional details (e.g. thickness, material) */
  details: string;
}

/** Paper filter-specific equipment with extended details. */
export interface PaperFilter {
  id: string;
  name: string;
  type: 'paper_filter';
  brand: string | null;
  /** Additional details (e.g. size, bleached/natural) */
  details: string;
}

/** Tamper-specific equipment with extended details. */
export interface Tamper {
  id: string;
  name: string;
  type: 'tamper';
  brand: string | null;
  /** Additional details (e.g. diameter, flat/convex) */
  details: string;
}
