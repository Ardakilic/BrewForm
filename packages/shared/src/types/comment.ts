/**
 * Comment type definition shared between API and frontend.
 */

/** A comment on a recipe. Supports nested replies via `parentCommentId`. */
export interface Comment {
  /** UUID primary key */
  id: string;
  /** FK to the parent recipe */
  recipeId: string;
  /** FK to the comment author */
  authorId: string;
  /** Comment body */
  content: string;
  /** FK to the parent comment for nested replies, or `null` for top-level */
  parentCommentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
