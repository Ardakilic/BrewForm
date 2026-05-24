/**
 * Photo type definition shared between API and frontend.
 */

/** A photo attached to a recipe. */
export interface Photo {
  /** UUID primary key */
  id: string;
  /** FK to the parent recipe */
  recipeId: string;
  /** Full-resolution image URL */
  url: string;
  /** Thumbnail image URL */
  thumbnailUrl: string;
  /** Alt text for accessibility */
  alt: string | null;
  /** Display order within the recipe's photo gallery */
  sortOrder: number;
  createdAt: Date;
  deletedAt: Date | null;
}
