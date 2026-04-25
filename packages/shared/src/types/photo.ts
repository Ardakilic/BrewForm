export interface Photo {
  id: string;
  recipeId: string;
  url: string;
  thumbnailUrl: string;
  alt: string | null;
  sortOrder: number;
  createdAt: Date;
  deletedAt: Date | null;
}