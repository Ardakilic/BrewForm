export type Visibility = 'draft' | 'private' | 'unlisted' | 'public';
export type BrewMethod =
  | 'espresso_machine'
  | 'v60'
  | 'french_press'
  | 'aeropress'
  | 'turkish_coffee'
  | 'drip_coffee'
  | 'chemex'
  | 'kalita_wave'
  | 'moka_pot'
  | 'cold_brew'
  | 'siphon';

export type DrinkType =
  | 'espresso'
  | 'americano'
  | 'flat_white'
  | 'latte'
  | 'cappuccino'
  | 'cortado'
  | 'macchiato'
  | 'turkish_coffee'
  | 'pour_over'
  | 'cold_brew'
  | 'french_press';

export type EmojiTag = 'fire' | 'rocket' | 'thumbsup' | 'neutral' | 'thumbsdown' | 'sick';

export interface Recipe {
  id: string;
  slug: string;
  title: string;
  authorId: string;
  visibility: Visibility;
  currentVersionId: string;
  likeCount: number;
  commentCount: number;
  forkCount: number;
  forkedFromId: string | null;
  featured: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface RecipeVersion {
  id: string;
  recipeId: string;
  versionNumber: number;
  productName: string | null;
  coffeeBrand: string | null;
  coffeeProcessing: string | null;
  vendorId: string | null;
  roastDate: Date | null;
  packageOpenDate: Date | null;
  grindDate: Date | null;
  brewDate: Date;
  brewMethod: BrewMethod;
  drinkType: DrinkType;
  brewerDetails: string | null;
  grinder: string | null;
  grindSize: string | null;
  groundWeightGrams: number | null;
  extractionTimeSeconds: number | null;
  extractionVolumeMl: number | null;
  temperatureCelsius: number | null;
  brewRatio: number | null;
  flowRate: number | null;
  personalNotes: string | null;
  isFavourite: boolean;
  rating: number | null;
  emojiTag: EmojiTag | null;
  createdAt: Date;
}

export interface RecipeCreateInput {
  title: string;
  visibility?: Visibility;
  productName?: string;
  coffeeBrand?: string;
  coffeeProcessing?: string;
  vendorId?: string;
  roastDate?: string;
  packageOpenDate?: string;
  grindDate?: string;
  brewDate?: string;
  brewMethod: BrewMethod;
  drinkType: DrinkType;
  brewerDetails?: string;
  grinder?: string;
  grindSize?: string;
  groundWeightGrams?: number;
  extractionTimeSeconds?: number;
  extractionVolumeMl?: number;
  temperatureCelsius?: number;
  personalNotes?: string;
  isFavourite?: boolean;
  rating?: number;
  emojiTag?: EmojiTag;
  setupId?: string;
  tasteNoteIds?: string[];
  equipmentIds?: string[];
  additionalPreparations?: AdditionalPreparation[];
}

export interface AdditionalPreparation {
  name: string;
  type: string;
  inputAmount: string;
  preparationType: string;
}

export interface RecipeUpdateInput extends Partial<RecipeCreateInput> {
  bumpVersion?: boolean;
}