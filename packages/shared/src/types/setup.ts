export interface Setup {
  id: string;
  name: string;
  userId: string;
  brewerDetails: string | null;
  grinder: string | null;
  portafilterId: string | null;
  basketId: string | null;
  puckScreenId: string | null;
  paperFilterId: string | null;
  tamperId: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}