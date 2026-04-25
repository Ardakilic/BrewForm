export interface Bean {
  id: string;
  name: string;
  brand: string | null;
  vendorId: string | null;
  roaster: string | null;
  roastLevel: string | null;
  processing: string | null;
  origin: string | null;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface Vendor {
  id: string;
  name: string;
  website: string | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}