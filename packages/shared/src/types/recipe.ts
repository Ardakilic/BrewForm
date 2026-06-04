/**
 * Recipe and recipe-version type definitions shared between API and frontend.
 *
 * Recipes are the core entity — each recipe has one or more versioned snapshots
 * (RecipeVersion) that capture the full brewing parameters at a point in time.
 *
 * Enum types in this file are aliased to the corresponding constants in
 * `@brewform/shared/constants`. They preserve the original public names so
 * every downstream consumer continues to compile unchanged while the source
 * of truth lives in one place.
 */
import type { BrewMethodValue } from '../constants/brew-methods.ts';
import type { DrinkTypeValue } from '../constants/drink-types.ts';
import type { EmojiTagKey } from '../constants/emoji-tags.ts';
import type { VisibilityValue } from '../constants/visibility.ts';
import type { AdditionalPreparationCategory as _AdditionalPreparationCategory } from '../constants/additional-preparation-types.ts';

/** Visibility state for a recipe. Drafts are only visible to the author. */
export type Visibility = VisibilityValue;

/** Supported brewing devices and techniques. */
export type BrewMethod = BrewMethodValue;

/** Final drink served to the consumer (may differ from the brew method). */
export type DrinkType = DrinkTypeValue;

/** Quick-reaction emoji a user can attach to their own brew. */
export type EmojiTag = EmojiTagKey;

/**
 * Full recipe response returned by `GET /api/v1/recipes/:slugOrId`.
 *
 * Contains metadata about the recipe itself but not the brewing parameters —
 * those live on the associated {@link RecipeVersion}.
 */
export interface Recipe {
  /** UUID primary key */
  id: string;
  /** URL-safe slug derived from the title, e.g. `"my-morning-espresso"` */
  slug: string;
  /** User-facing title */
  title: string;
  /** ID of the user who created this recipe */
  authorId: string;
  /** Visibility state */
  visibility: Visibility;
  /** ID of the current (latest) RecipeVersion */
  currentVersionId: string;
  /** Number of likes received */
  likeCount: number;
  /** Number of comments */
  commentCount: number;
  /** Number of times this recipe has been forked */
  forkCount: number;
  /** ID of the parent recipe if this is a fork, otherwise `null` */
  forkedFromId: string | null;
  /** Whether this recipe is featured on the platform */
  featured: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/**
 * A versioned snapshot of a recipe's brewing parameters.
 *
 * Each time a recipe is edited, a new version is created. The latest version's
 * data is what appears as the "current" recipe details.
 */
export interface RecipeVersion {
  /** UUID primary key */
  id: string;
  /** Parent recipe ID */
  recipeId: string;
  /** Monotonically increasing version counter (1-based) */
  versionNumber: number;
  /** Commercial name of the coffee product */
  productName: string | null;
  /** Brand/roastery name */
  coffeeBrand: string | null;
  /** Processing method (e.g. washed, natural) */
  coffeeProcessing: string | null;
  /** FK to the bean vendor */
  vendorId: string | null;
  /** Date the coffee was roasted */
  roastDate: Date | null;
  /** Date the sealed package was opened */
  packageOpenDate: Date | null;
  /** Date the coffee was ground */
  grindDate: Date | null;
  /** Date the brew was performed */
  brewDate: Date;
  /** Brewing device used */
  brewMethod: BrewMethod;
  /** Final drink served */
  drinkType: DrinkType;
  /** Free-text description of the brewer (e.g. model details) */
  brewerDetails: string | null;
  /** Grinder make/model */
  grinder: string | null;
  /** Grind size description (e.g. "medium-fine", "18 clicks on Comandante") */
  grindSize: string | null;
  /** Weight of ground coffee in grams */
  groundWeightGrams: number | null;
  /** Total extraction time in seconds */
  extractionTimeSeconds: number | null;
  /** Final beverage volume in millilitres */
  extractionVolumeMl: number | null;
  /** Brew temperature in degrees Celsius */
  temperatureCelsius: number | null;
  /** Brew ratio (extraction volume / ground weight) */
  brewRatio: number | null;
  /** Flow rate in ml/s */
  flowRate: number | null;
  /** Pre-infusion time in seconds */
  preInfusionTimeSeconds: number | null;
  /** FK to the bean used */
  beanId: string | null;
  /** Free-text personal tasting notes or observations */
  personalNotes: string | null;
  /** Whether the user marked this brew as a favourite */
  isFavourite: boolean;
  /** 1-5 star rating */
  rating: number | null;
  /** Quick-reaction emoji tag */
  emojiTag: EmojiTag | null;
  createdAt: Date;
}

/**
 * Input payload for `POST /api/v1/recipes`.
 *
 * All date fields accept ISO strings (converted to `Date` server-side).
 * Most fields are optional at creation time; only `title`, `brewMethod`,
 * and `drinkType` are required.
 */
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
  brewRatio?: number;
  flowRate?: number;
  preInfusionTimeSeconds?: number;
  beanId?: string;
  personalNotes?: string;
  isFavourite?: boolean;
  rating?: number;
  emojiTag?: EmojiTag;
  /** FK to a saved setup to pre-populate equipment */
  setupId?: string;
  /** IDs of taste notes to associate */
  tasteNoteIds?: string[];
  /** IDs of equipment to associate */
  equipmentIds?: string[];
  /** Additional preparations (milk, syrups, etc.) */
  additionalPreparations?: AdditionalPreparation[];
  /** Intensity values for selected taste notes, keyed by taste note ID */
  tasteNoteIntensities?: Record<string, number>;
}

/** Category of an additional preparation step. */
export type AdditionalPreparationCategory = _AdditionalPreparationCategory;

/**
 * An additional preparation step applied to a recipe version
 * (e.g. steaming milk, adding syrup, filtering water).
 */
export interface AdditionalPreparation {
  /** Display name */
  name: string;
  /** Category of the preparation */
  type: AdditionalPreparationCategory;
  /** Amount added (free-text, e.g. "150ml", "2 shots") */
  inputAmount: string;
  /** How the ingredient was prepared (e.g. "steamed", "cold") */
  preparationType: string;
}

/**
 * Input payload for `PATCH /api/v1/recipes/:slugOrId`.
 *
 * All fields are optional. When {@link bumpVersion} is `true` the API
 * creates a new version snapshot; otherwise the existing latest version
 * is updated in-place.
 */
export interface RecipeUpdateInput extends Partial<RecipeCreateInput> {
  /** If `true`, create a new version instead of mutating the current one */
  bumpVersion?: boolean;
}
