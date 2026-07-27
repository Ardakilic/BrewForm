/**
 * Coffee-variety-related types shared between API and frontend.
 *
 * The {@link CoffeeVarietyCategory} type is aliased to the corresponding
 * constant in `@brewform/shared/constants` so the database enum, Zod schema,
 * and TypeScript union share a single source of truth.
 */
import type { CoffeeVarietyCategory as _CoffeeVarietyCategory } from '../constants/coffee-variety.ts';

/** Coffee variety category union, re-exported from `@brewform/shared/constants`. */
export type CoffeeVarietyCategory = _CoffeeVarietyCategory;

/**
 * A coffee variety (cultivar) such as Gesha, Bourbon, or SL28.
 *
 * Contains agronomic, sensory, and market metadata used by recipes and
 * bean catalogues.
 */
export interface CoffeeVariety {
  /** UUID primary key */
  id: string;
  /** Common name of the variety */
  name: string;
  /** Botanical or market category */
  category: CoffeeVarietyCategory;
  /** Species (e.g. Arabica, Robusta) */
  species: string | null;
  /** Country or region of origin */
  origin: string | null;
  /** Geographic spread / distribution */
  spread: string | null;
  /** Typical altitude range in metres */
  altitudeRangeM: string | null;
  /** Tasting profile description */
  cupProfile: string | null;
  /** Body descriptor */
  body: string | null;
  /** Acidity descriptor */
  acidity: string | null;
  /** Caffeine percentage */
  caffeinePct: string | null;
  /** Compatible processing methods */
  processingCompatibility: string[] | null;
  /** Disease resistance notes */
  diseaseResistance: string | null;
  /** Yield potential descriptor */
  yield: string | null;
  /** Typical plant size */
  plantSize: string | null;
  /** Free-text notes */
  notes: string | null;
  /** Known sub-varieties */
  subVarieties: string[] | null;
  /** Fermentation characteristics */
  fermentation: string | null;
  /** Typical drying time in days */
  dryingTimeDays: string | null;
  /** Drying method used */
  dryingMethod: string | null;
  /** Mucilage retention percentage */
  mucilageRetentionPct: string | null;
  /** Price range descriptor */
  priceRange: string | null;
  /** Processing method */
  processing: string | null;
  /** Type label / classification */
  typeLabel: string | null;
  /** Notable farms growing this variety */
  notableFarms: string[] | null;
  /** Notable regions for this variety */
  notableRegions: string[] | null;
  /** Regional variant names */
  regionalVariants: string[] | null;
  /** Global market share percentage */
  globalSharePct: string | null;
  /** Whether this is a system-provided variety */
  isSystem: boolean;
  /** ID of the user who created this entry, or null for system records */
  createdBy: string | null;
  /** When this record was created */
  createdAt: Date;
  /** When this record was last updated */
  updatedAt: Date;
  /** When this record was soft-deleted, or null if active */
  deletedAt: Date | null;
}
