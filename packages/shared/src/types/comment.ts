export interface Comment {
  id: string;
  recipeId: string;
  authorId: string;
  content: string;
  parentCommentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}