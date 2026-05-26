export type CoffeeVarietyCategory = 'variety' | 'processing' | 'market_name';

export interface CoffeeVariety {
  id: string;
  name: string;
  category: CoffeeVarietyCategory;
  species: string | null;
  origin: string | null;
  spread: string | null;
  altitudeRangeM: string | null;
  cupProfile: string | null;
  body: string | null;
  acidity: string | null;
  caffeinePct: string | null;
  processingCompatibility: string[] | null;
  diseaseResistance: string | null;
  yield: string | null;
  plantSize: string | null;
  notes: string | null;
  subVarieties: string[] | null;
  fermentation: string | null;
  dryingTimeDays: string | null;
  dryingMethod: string | null;
  mucilageRetentionPct: string | null;
  priceRange: string | null;
  processing: string | null;
  typeLabel: string | null;
  notableFarms: string[] | null;
  notableRegions: string[] | null;
  regionalVariants: string[] | null;
  globalSharePct: string | null;
  isSystem: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
