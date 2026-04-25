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

export interface Equipment {
  id: string;
  name: string;
  type: EquipmentType;
  brand: string | null;
  model: string | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface Portafilter {
  id: string;
  name: string;
  type: 'portafilter';
  brand: string | null;
  details: string;
}

export interface Basket {
  id: string;
  name: string;
  type: 'basket';
  brand: string | null;
  details: string;
}

export interface PuckScreen {
  id: string;
  name: string;
  type: 'puck_screen';
  brand: string | null;
  details: string;
}

export interface PaperFilter {
  id: string;
  name: string;
  type: 'paper_filter';
  brand: string | null;
  details: string;
}

export interface Tamper {
  id: string;
  name: string;
  type: 'tamper';
  brand: string | null;
  details: string;
}