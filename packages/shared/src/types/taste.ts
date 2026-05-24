/**
 * Taste note type definitions shared between API and frontend.
 *
 * Taste notes form a hierarchical tree (e.g. "Fruity" → "Berry" → "Blueberry").
 * Users select taste notes and optionally assign intensity values to them
 * when creating a recipe version.
 */

/**
 * A single taste note in the flat list (used for CRUD operations).
 *
 * The tree structure is encoded via `parentId` and `depth`.
 */
export interface TasteNote {
  /** UUID primary key */
  id: string;
  /** Display name (e.g. "Blueberry") */
  name: string;
  /** FK to parent taste note, or `null` for root nodes */
  parentId: string | null;
  /** Hex colour used in UI (e.g. "#4A90D9") */
  color: string | null;
  /** Longer definition/description */
  definition: string | null;
  /** Tree depth (0 = root) */
  depth: number;
  createdAt: Date;
}

/**
 * A taste note with nested children, used for rendering the
 * hierarchical taste selector in the UI.
 */
export interface TasteHierarchy {
  id: string;
  name: string;
  color: string | null;
  definition: string | null;
  /** Direct child nodes */
  children: TasteHierarchy[];
}

/**
 * Many-to-many join linking a taste note to a recipe version.
 *
 * Intensity is stored separately in `RecipeCreateInput.tasteNoteIntensities`.
 */
export interface TasteSelection {
  /** FK to the taste note */
  tasteNoteId: string;
  /** FK to the recipe version */
  recipeVersionId: string;
}
