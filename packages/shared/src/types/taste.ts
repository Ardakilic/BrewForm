export interface TasteNote {
  id: string;
  name: string;
  parentId: string | null;
  color: string | null;
  definition: string | null;
  depth: number;
  createdAt: Date;
}

export interface TasteHierarchy {
  id: string;
  name: string;
  color: string | null;
  definition: string | null;
  children: TasteHierarchy[];
}

export interface TasteSelection {
  tasteNoteId: string;
  recipeVersionId: string;
}