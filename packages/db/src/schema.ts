import { relations } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

import {
  AnyPgColumn,
  boolean,
  check,
  decimal,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  ADDITIONAL_PREPARATION_TYPE_VALUES,
  BADGE_RULE_VALUES,
  BREW_METHOD_VALUES,
  COFFEE_VARIETY_CATEGORY_VALUES,
  DATE_FORMAT_VALUES,
  DRINK_TYPE_VALUES,
  EMOJI_TAG_VALUES,
  EQUIPMENT_DELETE_REQUEST_STATUS_VALUES,
  EQUIPMENT_TYPE_VALUES,
  REPORT_STATUS_VALUES,
  TEMPERATURE_UNIT_VALUES,
  THEME_VALUES,
  UNIT_SYSTEM_VALUES,
  VISIBILITY_VALUES,
} from '@brewform/shared/constants';

/**
 * Enums — values imported from @brewform/shared/constants
 * (single source of truth across DB, Zod, and TypeScript).
 */

/** Postgres enum driven by {@link VISIBILITY_VALUES}. */
export const visibilityEnum = pgEnum('visibility', [...VISIBILITY_VALUES]);

/** Union of {@link visibilityEnum} values. */
export type RecipeVisibility = typeof visibilityEnum.enumValues[number];

/** Postgres enum driven by {@link BREW_METHOD_VALUES}. */
export const brewMethodEnum = pgEnum('brew_method', [...BREW_METHOD_VALUES]);
/** Postgres enum driven by {@link DRINK_TYPE_VALUES}. */
export const drinkTypeEnum = pgEnum('drink_type', [...DRINK_TYPE_VALUES]);
/** Postgres enum driven by {@link EQUIPMENT_TYPE_VALUES}. */
export const equipmentTypeEnum = pgEnum('equipment_type', [...EQUIPMENT_TYPE_VALUES]);
/** Postgres enum driven by {@link EMOJI_TAG_VALUES}. */
export const emojiTagEnum = pgEnum('emoji_tag', [...EMOJI_TAG_VALUES]);
/** Postgres enum driven by {@link BADGE_RULE_VALUES}. */
export const badgeRuleEnum = pgEnum('badge_rule', [...BADGE_RULE_VALUES]);
/** Postgres enum driven by {@link UNIT_SYSTEM_VALUES}. */
export const unitSystemEnum = pgEnum('unit_system', [...UNIT_SYSTEM_VALUES]);
/** Postgres enum driven by {@link TEMPERATURE_UNIT_VALUES}. */
export const temperatureUnitEnum = pgEnum('temperature_unit', [...TEMPERATURE_UNIT_VALUES]);
/** Postgres enum driven by {@link THEME_VALUES}. */
export const themeEnum = pgEnum('theme', [...THEME_VALUES]);
/** Postgres enum driven by {@link DATE_FORMAT_VALUES}. */
export const dateFormatEnum = pgEnum('date_format', [...DATE_FORMAT_VALUES]);
/** Postgres enum driven by {@link ADDITIONAL_PREPARATION_TYPE_VALUES}. */
export const additionalPreparationTypeEnum = pgEnum(
  'additional_preparation_type',
  [...ADDITIONAL_PREPARATION_TYPE_VALUES],
);
/** Postgres enum driven by {@link REPORT_STATUS_VALUES}. */
export const reportStatusEnum = pgEnum('report_status', [...REPORT_STATUS_VALUES]);

/** Tables — Drizzle pgTable definitions for all BrewForm entities. */

/** User accounts; unique on `email` and `username`, soft-deleted via `deletedAt`. */
export const users = pgTable(
  'user',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    email: varchar('email', { length: 255 }).notNull().unique(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    username: varchar('username', { length: 255 }).notNull().unique(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    displayName: varchar('display_name', { length: 255 }),
    avatarUrl: varchar('avatar_url', { length: 500 }),
    bio: text('bio'),
    onboardingCompleted: boolean('onboarding_completed').notNull().default(false),
    isAdmin: boolean('is_admin').notNull().default(false),
    isBanned: boolean('is_banned').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('user_email_idx').on(table.email),
    index('user_username_idx').on(table.username),
    index('user_created_at_idx').on(table.createdAt),
    index('user_deleted_at_idx').on(table.deletedAt),
  ],
);

/** Per-user preferences (units, theme, locale, notification toggles); unique on `userId`. */
export const userPreferences = pgTable('user_preferences', {
  id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar('user_id', { length: 36 }).notNull().unique().references(() => users.id, {
    onDelete: 'cascade',
  }),
  unitSystem: unitSystemEnum('unit_system').notNull().default('metric'),
  temperatureUnit: temperatureUnitEnum('temperature_unit').notNull().default('celsius'),
  theme: themeEnum('theme').notNull().default('light'),
  locale: varchar('locale', { length: 10 }).notNull().default('en'),
  timezone: varchar('timezone', { length: 50 }).notNull().default('UTC'),
  dateFormat: dateFormatEnum('date_format').notNull().default('YYYY_MM_DD'),
  // F05 rename: was new_follower / recipe_liked / recipe_commented /
  // followed_user_posted / mentioned_in_comment. Renamed with `notify_`
  // prefix so the columns visually group in `\d user_preferences` and the
  // names match the flat `notify*` shared-schema fields end-to-end.
  notifyNewFollower: boolean('notify_new_follower').notNull().default(true),
  notifyRecipeLiked: boolean('notify_recipe_liked').notNull().default(true),
  notifyRecipeCommented: boolean('notify_recipe_commented').notNull().default(true),
  notifyFollowedUserPosted: boolean('notify_followed_user_posted').notNull().default(true),
  notifyMentionedInComment: boolean('notify_mentioned_in_comment').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Recipes; unique `slug`, soft-deleted via `deletedAt`, denormalized like/comment/fork counts. */
export const recipes = pgTable(
  'recipe',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    slug: varchar('slug', { length: 255 }).notNull().unique(),
    title: varchar('title', { length: 255 }).notNull(),
    authorId: varchar('author_id', { length: 36 }).notNull().references(() => users.id),
    visibility: visibilityEnum('visibility').notNull().default('draft'),
    currentVersionId: varchar('current_version_id', { length: 36 }).references(
      (): AnyPgColumn => recipeVersions.id,
      { onDelete: 'set null' },
    ),
    likeCount: integer('like_count').notNull().default(0),
    commentCount: integer('comment_count').notNull().default(0),
    forkCount: integer('fork_count').notNull().default(0),
    forkedFromId: varchar('forked_from_id', { length: 36 }).references((): AnyPgColumn =>
      recipes.id
    ),
    featured: boolean('featured').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('recipe_author_id_idx').on(table.authorId),
    index('recipe_visibility_idx').on(table.visibility),
    index('recipe_created_at_idx').on(table.createdAt),
    index('recipe_like_count_idx').on(table.likeCount),
    index('recipe_forked_from_id_idx').on(table.forkedFromId),
    index('recipe_slug_idx').on(table.slug),
    index('recipe_deleted_at_idx').on(table.deletedAt),
    /**
     * Composite index for user profile recipe listings.
     *
     * Serves `buildListRecipesWhere` (model.ts:187) when `authorId` filter
     * is combined with `visibility`. Equality columns first (authorId,
     * visibility) for direct B-tree seek.
     */
    index('recipe_author_visibility_idx').on(table.authorId, table.visibility),
    /**
     * Composite index for homepage feed and explore page queries.
     *
     * Serves `findMany` (model.ts:270) with default sortBy 'createdAt',
     * `getFeed` (model.ts:679), and `findStarred` (model.ts:700).
     * Visibility is equality; createdAt supports ORDER BY DESC without a
     * separate sort step.
     */
    index('recipe_visibility_created_idx').on(table.visibility, table.createdAt),
    /**
     * Composite index for trending / popular recipes queries.
     *
     * Serves `findMany` (model.ts:270) with `sortBy: 'likeCount'`.
     * Visibility is equality; likeCount supports ORDER BY DESC without a
     * separate sort step.
     */
    index('recipe_visibility_like_count_idx').on(table.visibility, table.likeCount),
    /**
     * Cursor-based pagination: supports (createdAt DESC, id) < (cursor) queries.
     * Both columns are DESC because the most common query is "newest first" feed.
     * Postgres can scan this index backward for ASC queries.
     */
    index('recipe_created_at_id_idx').on(table.createdAt.desc(), table.id.desc()),
  ],
);

/** Immutable recipe versions; unique on (`recipeId`, `versionNumber`), rating CHECK 1–10. */
export const recipeVersions = pgTable(
  'recipe_version',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    recipeId: varchar('recipe_id', { length: 36 }).notNull().references(() => recipes.id),
    versionNumber: integer('version_number').notNull(),
    productName: varchar('product_name', { length: 255 }),
    coffeeBrand: varchar('coffee_brand', { length: 255 }),
    coffeeProcessing: varchar('coffee_processing', { length: 255 }),
    vendorId: varchar('vendor_id', { length: 36 }).references(() => vendors.id),
    roastDate: timestamp('roast_date', { withTimezone: true }),
    packageOpenDate: timestamp('package_open_date', { withTimezone: true }),
    grindDate: timestamp('grind_date', { withTimezone: true }),
    brewDate: timestamp('brew_date', { withTimezone: true }).notNull().defaultNow(),
    brewMethod: brewMethodEnum('brew_method').notNull(),
    drinkType: drinkTypeEnum('drink_type').notNull(),
    brewerDetails: varchar('brewer_details', { length: 500 }),
    grinder: varchar('grinder', { length: 255 }),
    grindSize: varchar('grind_size', { length: 50 }),
    groundWeightGrams: real('ground_weight_grams'),
    extractionTimeSeconds: integer('extraction_time_seconds'),
    extractionVolumeMl: real('extraction_volume_ml'),
    temperatureCelsius: real('temperature_celsius'),
    tds: decimal('tds', { precision: 4, scale: 2 }),
    brewRatio: real('brew_ratio'),
    flowRate: real('flow_rate'),
    preInfusionTimeSeconds: integer('pre_infusion_time_seconds'),
    beanId: varchar('bean_id', { length: 36 }).references(() => beans.id),
    coffeeVarietyId: varchar('coffee_variety_id', { length: 36 })
      .references((): AnyPgColumn => coffeeVarieties.id),
    coffeeVarietyName: varchar('coffee_variety_name', { length: 255 }),
    personalNotes: text('personal_notes'),
    preparationNotes: text('preparation_notes').notNull(),
    isFavourite: boolean('is_favourite').notNull().default(false),
    rating: integer('rating'), // 1–10
    emojiTag: emojiTagEnum('emoji_tag'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('recipe_version_recipe_id_version_number_unique').on(
      table.recipeId,
      table.versionNumber,
    ),
    index('recipe_version_recipe_id_idx').on(table.recipeId),
    index('recipe_version_brew_method_idx').on(table.brewMethod),
    index('recipe_version_drink_type_idx').on(table.drinkType),
    index('recipe_version_created_at_idx').on(table.createdAt),
    /**
     * Composite index for coffee variety filtering subqueries. CRITICAL —
     * `coffeeVarietyId` had no index before, causing sequential scans on
     * every variety filter.
     *
     * Serves `recipeCoffeeVarietyCondition` (recipe/model.ts:30),
     * `getRecipesUsingVariety` (coffee-variety/model.ts:85),
     * `getVarietyRecipeCount` (admin/model.ts:613).
     *
     * `coffeeVarietyId` is nullable; PostgreSQL B-tree handles NULLs
     * correctly. Includes `recipeId` for index-only scans — the dominant
     * subquery selects only `recipeId`.
     */
    index('recipe_version_coffee_variety_idx').on(table.coffeeVarietyId, table.recipeId),
    check('recipe_version_rating_check', sql`${table.rating} BETWEEN 1 AND 10`),
  ],
);

/** Join: recipe versions ↔ taste notes; unique on (`recipeVersionId`, `tasteNoteId`), intensity CHECK 1–3. */
export const recipeTasteNotes = pgTable(
  'recipe_taste_note',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    recipeVersionId: varchar('recipe_version_id', { length: 36 }).notNull().references(
      () => recipeVersions.id,
      { onDelete: 'cascade' },
    ),
    tasteNoteId: varchar('taste_note_id', { length: 36 }).notNull().references(() => tasteNotes.id),
    intensity: integer('intensity').notNull().default(1),
    /** Audit timestamp — when the taste note was attached to this recipe version. */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('recipe_taste_note_recipe_version_id_taste_note_id_unique').on(
      table.recipeVersionId,
      table.tasteNoteId,
    ),
    index('recipe_taste_note_recipe_version_id_idx').on(table.recipeVersionId),
    index('recipe_taste_note_taste_note_id_idx').on(table.tasteNoteId),
    check('recipe_taste_note_intensity_check', sql`${table.intensity} BETWEEN 1 AND 3`),
  ],
);

/** Join: recipe versions ↔ equipment; unique on (`recipeVersionId`, `equipmentId`). */
export const recipeEquipment = pgTable(
  'recipe_equipment',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    recipeVersionId: varchar('recipe_version_id', { length: 36 }).notNull().references(
      () => recipeVersions.id,
      { onDelete: 'cascade' },
    ),
    equipmentId: varchar('equipment_id', { length: 36 }).notNull().references(() => equipment.id),
    /** Audit timestamp — when the equipment was attached to this recipe version. */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('recipe_equipment_recipe_version_id_equipment_id_unique').on(
      table.recipeVersionId,
      table.equipmentId,
    ),
    index('recipe_equipment_recipe_version_id_idx').on(table.recipeVersionId),
    index('recipe_equipment_equipment_id_idx').on(table.equipmentId),
  ],
);

/** Additional preparation steps for a recipe version; cascades on version delete. */
export const recipeAdditionalPreparations = pgTable(
  'recipe_additional_preparation',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    recipeVersionId: varchar('recipe_version_id', { length: 36 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    type: additionalPreparationTypeEnum('type').notNull(),
    inputAmount: varchar('input_amount', { length: 100 }).notNull(),
    preparationType: varchar('preparation_type', { length: 100 }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    foreignKey({
      name: 'recipe_addl_prep_recipe_version_id_fk',
      columns: [table.recipeVersionId],
      foreignColumns: [recipeVersions.id],
    }).onDelete('cascade'),
    index('recipe_additional_preparation_recipe_version_id_idx').on(table.recipeVersionId),
  ],
);

/** Recipe photos with thumbnail and sort order; soft-deleted via `deletedAt`. */
export const photos = pgTable(
  'photo',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    recipeId: varchar('recipe_id', { length: 36 }).notNull().references(() => recipes.id),
    url: varchar('url', { length: 500 }).notNull(),
    thumbnailUrl: varchar('thumbnail_url', { length: 500 }),
    alt: varchar('alt', { length: 255 }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('photo_recipe_id_idx').on(table.recipeId),
    index('photo_deleted_at_idx').on(table.deletedAt),
    /**
     * Composite index for recipe photo listings. No `sortOrder` index
     * existed before — this eliminates the in-memory sort.
     *
     * Serves `findByRecipe` (photo/model.ts:19) — filters by recipeId
     * and sorts by sortOrder ASC.
     */
    index('photo_recipe_sort_order_idx').on(table.recipeId, table.sortOrder),
  ],
);

/** Join: recipe versions ↔ photos; unique on (`recipeVersionId`, `photoId`). */
export const recipeVersionPhotos = pgTable(
  'recipe_version_photo',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    recipeVersionId: varchar('recipe_version_id', { length: 36 }).notNull().references(
      () => recipeVersions.id,
      { onDelete: 'cascade' },
    ),
    photoId: varchar('photo_id', { length: 36 }).notNull().references(() => photos.id),
    sortOrder: integer('sort_order').notNull().default(0),
    /** Audit timestamp — when the photo was attached to this recipe version. */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('recipe_version_photo_recipe_version_id_photo_id_unique').on(
      table.recipeVersionId,
      table.photoId,
    ),
    index('recipe_version_photo_recipe_version_id_idx').on(table.recipeVersionId),
    index('recipe_version_photo_photo_id_idx').on(table.photoId),
  ],
);

/** Coffee equipment entries; typed via {@link equipmentTypeEnum}, soft-deleted via `deletedAt`. */
export const equipment = pgTable(
  'equipment',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: varchar('name', { length: 255 }).notNull(),
    type: equipmentTypeEnum('type').notNull(),
    brand: varchar('brand', { length: 255 }),
    model: varchar('model', { length: 255 }),
    description: text('description'),
    createdBy: varchar('created_by', { length: 36 }).references(() => users.id),
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('equipment_type_idx').on(table.type),
    index('equipment_name_idx').on(table.name),
    index('equipment_deleted_at_idx').on(table.deletedAt),
    /**
     * Composite index for equipment filtered by type.
     *
     * Serves `findManyWithFilters` (equipment/model.ts:59) — filters by
     * type equality and sorts by name ASC.
     */
    index('equipment_type_name_idx').on(table.type, table.name),
  ],
);

/** Coffee bean entries per user; soft-deleted via `deletedAt`. */
export const beans = pgTable(
  'bean',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: varchar('name', { length: 255 }).notNull(),
    brand: varchar('brand', { length: 255 }),
    vendorId: varchar('vendor_id', { length: 36 }).references(() => vendors.id),
    roaster: varchar('roaster', { length: 255 }),
    roastLevel: varchar('roast_level', { length: 100 }),
    processing: varchar('processing', { length: 100 }),
    origin: varchar('origin', { length: 255 }),
    userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('bean_user_id_idx').on(table.userId),
    index('bean_deleted_at_idx').on(table.deletedAt),
    /**
     * Composite index for user bean listings. No `createdAt` index existed
     * before — this eliminates the in-memory sort.
     *
     * Serves `findByUser` (bean/model.ts:23) — filters by userId and
     * sorts by createdAt DESC.
     */
    index('bean_user_created_idx').on(table.userId, table.createdAt),
  ],
);

/** Postgres enum driven by {@link COFFEE_VARIETY_CATEGORY_VALUES}. */
export const coffeeVarietyCategoryEnum = pgEnum(
  'coffee_variety_category',
  [...COFFEE_VARIETY_CATEGORY_VALUES],
);

/** Coffee variety catalogue (system + user-created); soft-deleted via `deletedAt`. */
export const coffeeVarieties = pgTable('coffee_variety', {
  id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: varchar('name', { length: 255 }).notNull(),
  category: coffeeVarietyCategoryEnum('category').notNull(),
  species: varchar('species', { length: 255 }),
  origin: varchar('origin', { length: 500 }),
  spread: text('spread'),
  altitudeRangeM: varchar('altitude_range_m', { length: 100 }),
  cupProfile: text('cup_profile'),
  body: varchar('body', { length: 100 }),
  acidity: varchar('acidity', { length: 100 }),
  caffeinePct: varchar('caffeine_pct', { length: 50 }),
  processingCompatibility: text('processing_compatibility').array(),
  diseaseResistance: varchar('disease_resistance', { length: 100 }),
  yield: varchar('yield', { length: 100 }),
  plantSize: varchar('plant_size', { length: 100 }),
  notes: text('notes'),
  subVarieties: text('sub_varieties').array(),
  fermentation: text('fermentation'),
  dryingTimeDays: varchar('drying_time_days', { length: 50 }),
  dryingMethod: text('drying_method'),
  mucilageRetentionPct: varchar('mucilage_retention_pct', { length: 50 }),
  priceRange: varchar('price_range', { length: 100 }),
  processing: varchar('processing', { length: 255 }),
  typeLabel: varchar('type_label', { length: 255 }),
  notableFarms: text('notable_farms').array(),
  notableRegions: text('notable_regions').array(),
  regionalVariants: text('regional_variants').array(),
  globalSharePct: varchar('global_share_pct', { length: 50 }),
  isSystem: boolean('is_system').notNull().default(true),
  createdBy: varchar('created_by', { length: 36 }).references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => [
  index('coffee_variety_name_idx').on(table.name),
  index('coffee_variety_category_idx').on(table.category),
  index('coffee_variety_deleted_at_idx').on(table.deletedAt),
  /**
   * Composite index for coffee varieties filtered by category.
   *
   * Serves `findMany` (coffee-variety/model.ts:13) and
   * `listCoffeeVarieties` (admin/model.ts:551) — filters by category
   * equality and sorts by name ASC.
   */
  index('coffee_variety_category_name_idx').on(table.category, table.name),
]);

/** Coffee vendors/roasters; soft-deleted via `deletedAt`. */
export const vendors = pgTable(
  'vendor',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: varchar('name', { length: 255 }).notNull(),
    website: varchar('website', { length: 500 }),
    description: text('description'),
    createdBy: varchar('created_by', { length: 36 }).references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('vendor_name_idx').on(table.name),
    index('vendor_deleted_at_idx').on(table.deletedAt),
  ],
);

/** Hierarchical taste-note taxonomy (self-referencing `parentId`); soft-deleted via `deletedAt`. */
export const tasteNotes = pgTable(
  'taste_note',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: varchar('name', { length: 255 }).notNull(),
    parentId: varchar('parent_id', { length: 36 }).references((): AnyPgColumn => tasteNotes.id),
    color: varchar('color', { length: 50 }),
    definition: text('definition'),
    depth: integer('depth').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('taste_note_parent_id_idx').on(table.parentId),
    index('taste_note_name_idx').on(table.name),
    index('taste_note_depth_idx').on(table.depth),
    /**
     * Single-column index on `deletedAt` for parity. Every other
     * soft-delete table in the schema has this index; `tasteNotes` was
     * the lone exception.
     */
    index('taste_note_deleted_at_idx').on(table.deletedAt),
    /**
     * Composite index for fetching child taste notes of a parent.
     *
     * Serves `findChildren` (taste/model.ts:19) — filters by parentId
     * and sorts by name ASC.
     */
    index('taste_note_parent_name_idx').on(table.parentId, table.name),
    /**
     * Composite index for full taste-note hierarchy loading.
     *
     * Serves `findAll` and `getHierarchy` (taste/model.ts:13,40) —
     * orders by depth ASC, name ASC for tree rendering.
     */
    index('taste_note_depth_name_idx').on(table.depth, table.name),
  ],
);

/** User brewing setups with five equipment slots; soft-deleted via `deletedAt`. */
export const setups = pgTable(
  'setup',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: varchar('name', { length: 255 }).notNull(),
    userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
    brewerDetails: varchar('brewer_details', { length: 500 }),
    grinder: varchar('grinder', { length: 255 }),
    portafilterId: varchar('portafilter_id', { length: 36 }).references(() => equipment.id),
    basketId: varchar('basket_id', { length: 36 }).references(() => equipment.id),
    puckScreenId: varchar('puck_screen_id', { length: 36 }).references(() => equipment.id),
    paperFilterId: varchar('paper_filter_id', { length: 36 }).references(() => equipment.id),
    tamperId: varchar('tamper_id', { length: 36 }).references(() => equipment.id),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('setup_user_id_idx').on(table.userId),
    index('setup_deleted_at_idx').on(table.deletedAt),
    /**
     * Composite index for user setup listings. No `createdAt` index existed
     * before — this eliminates the in-memory sort.
     *
     * Serves `findByUser` (setup/model.ts:25) — filters by userId and
     * sorts by createdAt DESC.
     */
    index('setup_user_created_idx').on(table.userId, table.createdAt),
  ],
);

/** Threaded recipe comments (self-referencing `parentCommentId`); soft-deleted via `deletedAt`. */
export const comments = pgTable(
  'comment',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    recipeId: varchar('recipe_id', { length: 36 }).notNull().references(() => recipes.id),
    authorId: varchar('author_id', { length: 36 }).notNull().references(() => users.id),
    content: text('content').notNull(),
    parentCommentId: varchar('parent_comment_id', { length: 36 }).references((): AnyPgColumn =>
      comments.id
    ),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('comment_recipe_id_idx').on(table.recipeId),
    index('comment_author_id_idx').on(table.authorId),
    index('comment_parent_comment_id_idx').on(table.parentCommentId),
    index('comment_created_at_idx').on(table.createdAt),
    index('comment_deleted_at_idx').on(table.deletedAt),
    /**
     * Composite index for top-level comment listing on a recipe detail page.
     *
     * Serves `findByRecipe` (comment/model.ts:45) — filters by recipeId
     * equality, parentCommentId IS NULL, and sorts by createdAt DESC.
     * Columns ordered: equality (recipeId, parentCommentId), then sort (createdAt).
     */
    index('comment_recipe_parent_created_idx').on(
      table.recipeId,
      table.parentCommentId,
      table.createdAt,
    ),
    /**
     * Composite index for fetching replies to comments.
     *
     * Serves `findReplies` (comment/model.ts:82) — filters by
     * parentCommentId IN (...) and sorts by createdAt ASC.
     */
    index('comment_parent_created_idx').on(table.parentCommentId, table.createdAt),
  ],
);

/** User follow graph; unique on (`followerId`, `followingId`). */
export const userFollows = pgTable(
  'user_follow',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    followerId: varchar('follower_id', { length: 36 }).notNull().references(() => users.id),
    followingId: varchar('following_id', { length: 36 }).notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('user_follow_follower_id_following_id_unique').on(table.followerId, table.followingId),
    index('user_follow_follower_id_idx').on(table.followerId),
    index('user_follow_following_id_idx').on(table.followingId),
    index('user_follow_created_at_idx').on(table.createdAt),
    /**
     * Composite index for paginated follower listings.
     *
     * Serves `getFollowers` (follow/model.ts:41) — filters by followingId
     * and sorts by createdAt DESC with an INNER JOIN on users.
     */
    index('user_follow_following_created_idx').on(table.followingId, table.createdAt),
    /**
     * Composite index for paginated following listings.
     *
     * Serves `getFollowing` (follow/model.ts:78) — filters by followerId
     * and sorts by createdAt DESC with an INNER JOIN on users.
     */
    index('user_follow_follower_created_idx').on(table.followerId, table.createdAt),
  ],
);

/** User recipe favourites; unique on (`userId`, `recipeId`). */
export const userRecipeFavourites = pgTable(
  'user_recipe_favourite',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
    recipeId: varchar('recipe_id', { length: 36 }).notNull().references(() => recipes.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('user_recipe_favourite_user_id_recipe_id_unique').on(table.userId, table.recipeId),
    index('user_recipe_favourite_user_id_idx').on(table.userId),
    index('user_recipe_favourite_recipe_id_idx').on(table.recipeId),
    index('user_recipe_favourite_created_at_idx').on(table.createdAt),
  ],
);

/** User recipe likes; unique on (`userId`, `recipeId`). */
export const userRecipeLikes = pgTable(
  'user_recipe_like',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
    recipeId: varchar('recipe_id', { length: 36 }).notNull().references(() => recipes.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('user_recipe_like_user_id_recipe_id_unique').on(table.userId, table.recipeId),
    index('user_recipe_like_user_id_idx').on(table.userId),
    index('user_recipe_like_recipe_id_idx').on(table.recipeId),
    index('user_recipe_like_created_at_idx').on(table.createdAt),
  ],
);

/** User recipe ratings (1–10 CHECK); unique on (`userId`, `recipeId`). */
export const userRecipeRatings = pgTable(
  'user_recipe_rating',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
    recipeId: varchar('recipe_id', { length: 36 }).notNull().references(() => recipes.id),
    rating: integer('rating').notNull(), // 1–10
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('user_recipe_rating_user_id_recipe_id_unique').on(table.userId, table.recipeId),
    index('user_recipe_rating_user_id_idx').on(table.userId),
    index('user_recipe_rating_recipe_id_idx').on(table.recipeId),
    check('user_recipe_rating_rating_check', sql`${table.rating} BETWEEN 1 AND 10`),
  ],
);

/** Badge definitions; unique on `rule`. */
export const badges = pgTable(
  'badge',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: varchar('name', { length: 255 }).notNull(),
    icon: varchar('icon', { length: 100 }).notNull(),
    description: text('description').notNull(),
    rule: badgeRuleEnum('rule').notNull(),
    threshold: integer('threshold').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('badge_rule_unique').on(table.rule),
    index('badge_rule_idx').on(table.rule),
  ],
);

/** Awarded user badges; unique on (`userId`, `badgeId`). */
export const userBadges = pgTable(
  'user_badge',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
    badgeId: varchar('badge_id', { length: 36 }).notNull().references(() => badges.id),
    awardedAt: timestamp('awarded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('user_badge_user_id_badge_id_unique').on(table.userId, table.badgeId),
    index('user_badge_user_id_idx').on(table.userId),
    index('user_badge_badge_id_idx').on(table.badgeId),
  ],
);

/** Brew-method ↔ equipment-type compatibility matrix; unique on (`brewMethod`, `equipmentType`). */
export const brewMethodEquipmentRules = pgTable(
  'brew_method_equipment_rule',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    brewMethod: brewMethodEnum('brew_method').notNull(),
    equipmentType: equipmentTypeEnum('equipment_type').notNull(),
    compatible: boolean('compatible').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('brew_method_equipment_rule_brew_method_equipment_type_unique').on(
      table.brewMethod,
      table.equipmentType,
    ),
    index('brew_method_equipment_rule_brew_method_idx').on(table.brewMethod),
    index('brew_method_equipment_rule_equipment_type_idx').on(table.equipmentType),
  ],
);

/** Postgres enum driven by {@link EQUIPMENT_DELETE_REQUEST_STATUS_VALUES}. */
export const equipmentDeleteRequestStatusEnum = pgEnum(
  'equipment_delete_request_status',
  [...EQUIPMENT_DELETE_REQUEST_STATUS_VALUES],
);

/** Community equipment deletion requests with review workflow; soft-deleted via `deletedAt`. */
export const equipmentDeleteRequests = pgTable('equipment_delete_request', {
  id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  equipmentId: varchar('equipment_id', { length: 36 }).notNull()
    .references(() => equipment.id, { onDelete: 'cascade' }),
  requestedById: varchar('requested_by_id', { length: 36 }).notNull()
    .references(() => users.id),
  reason: text('reason'),
  status: equipmentDeleteRequestStatusEnum('status').notNull().default('pending'),
  reviewedById: varchar('reviewed_by_id', { length: 36 }).references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => [
  index('edr_equipment_id_idx').on(table.equipmentId),
  index('edr_status_idx').on(table.status),
  index('edr_deleted_at_idx').on(table.deletedAt),
]);

/** Admin audit trail (action, entity, details). */
export const auditLogs = pgTable(
  'audit_log',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    adminId: varchar('admin_id', { length: 36 }).notNull().references(() => users.id),
    action: varchar('action', { length: 255 }).notNull(),
    entity: varchar('entity', { length: 255 }).notNull(),
    entityId: varchar('entity_id', { length: 36 }),
    details: text('details'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_log_admin_id_idx').on(table.adminId),
    index('audit_log_entity_idx').on(table.entity),
    index('audit_log_created_at_idx').on(table.createdAt),
  ],
);

/** Password reset tokens; unique `token`, expiry-tracked. */
export const passwordResets = pgTable(
  'password_reset',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
    token: varchar('token', { length: 255 }).notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('password_reset_token_idx').on(table.token),
    index('password_reset_user_id_idx').on(table.userId),
    index('password_reset_expires_at_idx').on(table.expiresAt),
  ],
);

/** Email verification tokens; unique `token`, cascades on user delete. */
export const emailVerificationTokens = pgTable(
  'email_verification_token',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id, {
      onDelete: 'cascade',
    }),
    token: varchar('token', { length: 255 }).notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('email_verification_token_user_id_idx').on(table.userId),
    index('email_verification_token_expires_at_idx').on(table.expiresAt),
  ],
);

/** User content reports with resolution workflow; typed via {@link reportStatusEnum}. */
export const reports = pgTable(
  'report',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    reporterId: varchar('reporter_id', { length: 36 }).notNull().references(() => users.id),
    entityType: varchar('entity_type', { length: 100 }).notNull(),
    entityId: varchar('entity_id', { length: 36 }).notNull(),
    reason: text('reason').notNull(),
    status: reportStatusEnum('status').notNull().default('pending'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedBy: varchar('resolved_by', { length: 36 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('report_entity_type_entity_id_idx').on(table.entityType, table.entityId),
    index('report_status_idx').on(table.status),
    index('report_reporter_id_idx').on(table.reporterId),
    index('report_created_at_idx').on(table.createdAt),
    /**
     * Composite index for report listing filtered by status.
     *
     * Serves `findMany` (report/model.ts:38) and `listReports`
     * (admin/model.ts:388) — filters by status (most commonly 'pending')
     * and sorts by createdAt DESC.
     */
    index('report_status_created_idx').on(table.status, table.createdAt),
  ],
);

/**
 * Collections — user-owned named groupings of recipes ("playlists for recipes").
 *
 * Soft-deletable main entity with `private`/`unlisted`/`public` visibility
 * (reuses the existing `visibilityEnum`). The `collectionItems` join table
 * carries ordering (`sortOrder`) and an audit timestamp (`createdAt`).
 */
export const collections = pgTable(
  'collection',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    visibility: visibilityEnum('visibility').notNull().default('private'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('collection_user_id_idx').on(table.userId),
    index('collection_visibility_idx').on(table.visibility),
    index('collection_created_at_idx').on(table.createdAt),
    index('collection_deleted_at_idx').on(table.deletedAt),
  ],
);

/**
 * Collection items — join table between `collections` and `recipes`.
 *
 * `collectionId` cascades on collection hard-delete; `recipeId` has no
 * `onDelete` (recipes are soft-deleted, the join row stays and is filtered
 * by `isNull(recipes.deletedAt)` at query time). The composite unique
 * constraint prevents duplicate recipe-in-collection entries.
 */
export const collectionItems = pgTable(
  'collection_item',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    collectionId: varchar('collection_id', { length: 36 }).notNull().references(
      () => collections.id,
      { onDelete: 'cascade' },
    ),
    recipeId: varchar('recipe_id', { length: 36 }).notNull().references(() => recipes.id),
    sortOrder: integer('sort_order').notNull().default(0),
    /** Audit timestamp — when the recipe was added to this collection. */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('collection_item_collection_id_recipe_id_unique').on(
      table.collectionId,
      table.recipeId,
    ),
    index('collection_item_collection_id_idx').on(table.collectionId),
    index('collection_item_recipe_id_idx').on(table.recipeId),
  ],
);

/**
 * Notification type enum (single source of truth for the `notifications.type`
 * column). F04 introduced `mention`; F05 extends with `follow` / `like` /
 * `comment`. `badge` and `system` are NOT added by F05 — there are no fan-out
 * call sites today (badge awards do not even email yet; system notifications
 * would require an admin broadcast UI that does not exist). Add values as their
 * creators land; remember `ALTER TYPE … ADD VALUE` is non-reversible.
 *
 * Values are declared inline (not sourced from `@brewform/shared/constants`)
 * because the notification module pre-dates the shared-constants convention
 * and the enum is private to the notifications feature.
 */
export const notificationTypeEnum = pgEnum('notification_type', [
  'mention',
  'follow',
  'like',
  'comment',
]);

/**
 * Notifications — per-user in-app notification feed.
 *
 * Soft-deletable main entity. `userId` is the recipient (cascades on user
 * hard-delete); `actorId` is the user who triggered the notification (nullable
 * — e.g. the mentioning user — uses `onDelete: 'set null'` so deleting an
 * actor nullifies the reference instead of blocking deletion; the model layer
 * left-joins actor and tolerates null actors). `type` is the
 * `notification_type` enum. `referenceId` /
 * `referenceType` point at the related entity (e.g. a comment on a recipe) and
 * `metadata` holds an optional JSON string payload (precedent:
 * `auditLogs.details`). Indexes serve the paginated feed `(userId, createdAt)`
 * and the unread-count query `(userId, readAt)`.
 */
export const notifications = pgTable(
  'notification',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id, {
      onDelete: 'cascade',
    }),
    actorId: varchar('actor_id', { length: 36 }).references(() => users.id, {
      onDelete: 'set null',
    }),
    type: notificationTypeEnum('type').notNull(),
    referenceId: varchar('reference_id', { length: 36 }),
    referenceType: varchar('reference_type', { length: 50 }),
    /** Optional JSON string payload (precedent: `auditLogs.details` text column). */
    metadata: text('metadata'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('notification_deleted_at_idx').on(table.deletedAt),
    /**
     * Composite index for the paginated notification feed.
     *
     * Serves list queries filtering by `userId` equality and ordering by
     * `createdAt` DESC.
     */
    index('notification_user_created_idx').on(table.userId, table.createdAt),
    /**
     * Composite index for the unread-count query.
     *
     * Serves `WHERE userId = ? AND readAt IS NULL` — `userId` equality first,
     * `readAt` second.
     */
    index('notification_user_read_at_idx').on(table.userId, table.readAt),
  ],
);

// ============================================================
// Relations
// ============================================================

/** Drizzle relations for users: preferences, recipes, comments, badges, follows (both directions), likes, favourites, setups, equipment, beans, vendors, audit logs, password resets, email verifications, reports, collections, notifications. */
export const usersRelations = relations(users, ({ one, many }) => ({
  preferences: one(userPreferences, {
    fields: [users.id],
    references: [userPreferences.userId],
  }),
  recipes: many(recipes),
  comments: many(comments),
  badges: many(userBadges),
  followsAsFollower: many(userFollows, { relationName: 'UserFollows' }),
  followsAsFollowing: many(userFollows, { relationName: 'UserFollowing' }),
  likes: many(userRecipeLikes),
  favourites: many(userRecipeFavourites),
  collections: many(collections),
  setups: many(setups),
  equipment: many(equipment),
  beans: many(beans),
  vendors: many(vendors),
  auditLogs: many(auditLogs),
  passwordResets: many(passwordResets),
  emailVerificationTokens: many(emailVerificationTokens),
  reports: many(reports),
  notifications: many(notifications, { relationName: 'NotificationRecipient' }),
}));

/** Drizzle relations for user_preferences: owning user. */
export const userPreferencesRelations = relations(userPreferences, ({ one }) => ({
  user: one(users, {
    fields: [userPreferences.userId],
    references: [users.id],
  }),
}));

/** Drizzle relations for recipes: author, versions, photos, comments, likes, favourites, and fork lineage (forkedFrom/forks), and collection items. */
export const recipesRelations = relations(recipes, ({ one, many }) => ({
  author: one(users, {
    fields: [recipes.authorId],
    references: [users.id],
  }),
  versions: many(recipeVersions),
  photos: many(photos),
  comments: many(comments),
  likes: many(userRecipeLikes),
  favourites: many(userRecipeFavourites),
  collectionItems: many(collectionItems),
  forkedFrom: one(recipes, {
    fields: [recipes.forkedFromId],
    references: [recipes.id],
  }),
  forks: many(recipes, { relationName: 'RecipeFork' }),
}));

/** Drizzle relations for recipe_versions: parent recipe, vendor, bean, coffee variety, taste notes, equipment, additional preparations, version photos. */
export const recipeVersionsRelations = relations(recipeVersions, ({ one, many }) => ({
  recipe: one(recipes, {
    fields: [recipeVersions.recipeId],
    references: [recipes.id],
  }),
  vendor: one(vendors, {
    fields: [recipeVersions.vendorId],
    references: [vendors.id],
  }),
  bean: one(beans, {
    fields: [recipeVersions.beanId],
    references: [beans.id],
  }),
  coffeeVariety: one(coffeeVarieties, {
    fields: [recipeVersions.coffeeVarietyId],
    references: [coffeeVarieties.id],
    relationName: 'coffee_variety_versions',
  }),
  tasteNotes: many(recipeTasteNotes),
  equipment: many(recipeEquipment),
  additionalPreparations: many(recipeAdditionalPreparations),
  versionPhotos: many(recipeVersionPhotos),
}));

/** Drizzle relations for the recipe_taste_notes join table: recipe version and taste note. */
export const recipeTasteNotesRelations = relations(recipeTasteNotes, ({ one }) => ({
  recipeVersion: one(recipeVersions, {
    fields: [recipeTasteNotes.recipeVersionId],
    references: [recipeVersions.id],
  }),
  tasteNote: one(tasteNotes, {
    fields: [recipeTasteNotes.tasteNoteId],
    references: [tasteNotes.id],
  }),
}));

/** Drizzle relations for the recipe_equipment join table: recipe version and equipment. */
export const recipeEquipmentRelations = relations(recipeEquipment, ({ one }) => ({
  recipeVersion: one(recipeVersions, {
    fields: [recipeEquipment.recipeVersionId],
    references: [recipeVersions.id],
  }),
  equipment: one(equipment, {
    fields: [recipeEquipment.equipmentId],
    references: [equipment.id],
  }),
}));

/** Drizzle relations for recipe_additional_preparations: owning recipe version. */
export const recipeAdditionalPreparationsRelations = relations(
  recipeAdditionalPreparations,
  ({ one }) => ({
    recipeVersion: one(recipeVersions, {
      fields: [recipeAdditionalPreparations.recipeVersionId],
      references: [recipeVersions.id],
    }),
  }),
);

/** Drizzle relations for photos: parent recipe and version-photo links. */
export const photosRelations = relations(photos, ({ one, many }) => ({
  recipe: one(recipes, {
    fields: [photos.recipeId],
    references: [recipes.id],
  }),
  versionPhotos: many(recipeVersionPhotos),
}));

/** Drizzle relations for the recipe_version_photos join table: recipe version and photo. */
export const recipeVersionPhotosRelations = relations(recipeVersionPhotos, ({ one }) => ({
  recipeVersion: one(recipeVersions, {
    fields: [recipeVersionPhotos.recipeVersionId],
    references: [recipeVersions.id],
  }),
  photo: one(photos, {
    fields: [recipeVersionPhotos.photoId],
    references: [photos.id],
  }),
}));

/** Drizzle relations for equipment: creating user, recipe-equipment links, and per-slot setup usages (portafilter, basket, puck screen, paper filter, tamper). */
export const equipmentRelations = relations(equipment, ({ one, many }) => ({
  createdByUser: one(users, {
    fields: [equipment.createdBy],
    references: [users.id],
  }),
  recipeEquipment: many(recipeEquipment),
  setupPortafilters: many(setups, { relationName: 'SetupPortafilter' }),
  setupBaskets: many(setups, { relationName: 'SetupBasket' }),
  setupPuckScreens: many(setups, { relationName: 'SetupPuckScreen' }),
  setupPaperFilters: many(setups, { relationName: 'SetupPaperFilter' }),
  setupTampers: many(setups, { relationName: 'SetupTamper' }),
}));

/** Drizzle relations for beans: vendor, owning user, and recipe versions brewed with the bean. */
export const beansRelations = relations(beans, ({ one, many }) => ({
  vendor: one(vendors, {
    fields: [beans.vendorId],
    references: [vendors.id],
  }),
  user: one(users, {
    fields: [beans.userId],
    references: [users.id],
  }),
  recipeVersions: many(recipeVersions),
}));

/** Drizzle relations for vendors: creating user, beans, and recipe versions referencing the vendor. */
export const vendorsRelations = relations(vendors, ({ one, many }) => ({
  createdByUser: one(users, {
    fields: [vendors.createdBy],
    references: [users.id],
  }),
  beans: many(beans),
  recipeVersions: many(recipeVersions),
}));

/** Drizzle relations for taste_notes: parent/children hierarchy and recipe-taste-note links. */
export const tasteNotesRelations = relations(tasteNotes, ({ one, many }) => ({
  parent: one(tasteNotes, {
    fields: [tasteNotes.parentId],
    references: [tasteNotes.id],
  }),
  children: many(tasteNotes),
  recipeTasteNotes: many(recipeTasteNotes),
}));

/** Drizzle relations for setups: owning user and the five equipment slots (portafilter, basket, puck screen, paper filter, tamper). */
export const setupsRelations = relations(setups, ({ one }) => ({
  user: one(users, {
    fields: [setups.userId],
    references: [users.id],
  }),
  portafilter: one(equipment, {
    fields: [setups.portafilterId],
    references: [equipment.id],
    relationName: 'SetupPortafilter',
  }),
  basket: one(equipment, {
    fields: [setups.basketId],
    references: [equipment.id],
    relationName: 'SetupBasket',
  }),
  puckScreen: one(equipment, {
    fields: [setups.puckScreenId],
    references: [equipment.id],
    relationName: 'SetupPuckScreen',
  }),
  paperFilter: one(equipment, {
    fields: [setups.paperFilterId],
    references: [equipment.id],
    relationName: 'SetupPaperFilter',
  }),
  tamper: one(equipment, {
    fields: [setups.tamperId],
    references: [equipment.id],
    relationName: 'SetupTamper',
  }),
}));

/** Drizzle relations for comments: recipe, author, parent comment, and replies. */
export const commentsRelations = relations(comments, ({ one, many }) => ({
  recipe: one(recipes, {
    fields: [comments.recipeId],
    references: [recipes.id],
  }),
  author: one(users, {
    fields: [comments.authorId],
    references: [users.id],
  }),
  parentComment: one(comments, {
    fields: [comments.parentCommentId],
    references: [comments.id],
  }),
  replies: many(comments),
}));

/** Drizzle relations for the user_follows join table: follower and followed user. */
export const userFollowsRelations = relations(userFollows, ({ one }) => ({
  follower: one(users, {
    fields: [userFollows.followerId],
    references: [users.id],
    relationName: 'UserFollows',
  }),
  following: one(users, {
    fields: [userFollows.followingId],
    references: [users.id],
    relationName: 'UserFollowing',
  }),
}));

/** Drizzle relations for the user_recipe_favourites join table: user and recipe. */
export const userRecipeFavouritesRelations = relations(userRecipeFavourites, ({ one }) => ({
  user: one(users, {
    fields: [userRecipeFavourites.userId],
    references: [users.id],
  }),
  recipe: one(recipes, {
    fields: [userRecipeFavourites.recipeId],
    references: [recipes.id],
  }),
}));

/** Drizzle relations for the user_recipe_ratings join table: user and recipe. */
export const userRecipeRatingsRelations = relations(userRecipeRatings, ({ one }) => ({
  user: one(users, {
    fields: [userRecipeRatings.userId],
    references: [users.id],
  }),
  recipe: one(recipes, {
    fields: [userRecipeRatings.recipeId],
    references: [recipes.id],
  }),
}));

/** Drizzle relations for the user_recipe_likes join table: user and recipe. */
export const userRecipeLikesRelations = relations(userRecipeLikes, ({ one }) => ({
  user: one(users, {
    fields: [userRecipeLikes.userId],
    references: [users.id],
  }),
  recipe: one(recipes, {
    fields: [userRecipeLikes.recipeId],
    references: [recipes.id],
  }),
}));

/** Drizzle relations for badges: user_badges award rows. */
export const badgesRelations = relations(badges, ({ many }) => ({
  userBadges: many(userBadges),
}));

/** Drizzle relations for the user_badges join table: user and badge. */
export const userBadgesRelations = relations(userBadges, ({ one }) => ({
  user: one(users, {
    fields: [userBadges.userId],
    references: [users.id],
  }),
  badge: one(badges, {
    fields: [userBadges.badgeId],
    references: [badges.id],
  }),
}));

/** Drizzle relations for brew_method_equipment_rules: none (standalone lookup table). */
export const brewMethodEquipmentRulesRelations = relations(brewMethodEquipmentRules, () => ({}));

/** Drizzle relations for coffee_varieties: creating user and recipe versions using the variety. */
export const coffeeVarietiesRelations = relations(coffeeVarieties, ({ one, many }) => ({
  createdByUser: one(users, {
    fields: [coffeeVarieties.createdBy],
    references: [users.id],
    relationName: 'coffee_variety_creator',
  }),
  recipeVersions: many(recipeVersions, { relationName: 'coffee_variety_versions' }),
}));

/** Drizzle relations for equipment_delete_requests: target equipment, requesting user, and reviewing admin. */
export const equipmentDeleteRequestsRelations = relations(equipmentDeleteRequests, ({ one }) => ({
  equipment: one(equipment, {
    fields: [equipmentDeleteRequests.equipmentId],
    references: [equipment.id],
  }),
  requestedBy: one(users, {
    fields: [equipmentDeleteRequests.requestedById],
    references: [users.id],
    relationName: 'delete_request_requester',
  }),
  reviewedBy: one(users, {
    fields: [equipmentDeleteRequests.reviewedById],
    references: [users.id],
    relationName: 'delete_request_reviewer',
  }),
}));

/** Drizzle relations for audit_logs: acting admin user. */
export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  admin: one(users, {
    fields: [auditLogs.adminId],
    references: [users.id],
  }),
}));

/** Drizzle relations for password_resets: owning user. */
export const passwordResetsRelations = relations(passwordResets, ({ one }) => ({
  user: one(users, {
    fields: [passwordResets.userId],
    references: [users.id],
  }),
}));

/** Drizzle relations for reports: reporting user. */
export const reportsRelations = relations(reports, ({ one }) => ({
  reporter: one(users, {
    fields: [reports.reporterId],
    references: [users.id],
  }),
}));

/** Drizzle relations for email_verification_tokens: owning user. */
export const emailVerificationTokensRelations = relations(
  emailVerificationTokens,
  ({ one }) => ({
    user: one(users, {
      fields: [emailVerificationTokens.userId],
      references: [users.id],
    }),
  }),
);

/** Drizzle relations for collections: owner user and collection items. */
export const collectionsRelations = relations(collections, ({ one, many }) => ({
  user: one(users, {
    fields: [collections.userId],
    references: [users.id],
  }),
  items: many(collectionItems),
}));

/** Drizzle relations for collection_items: parent collection and recipe. */
export const collectionItemsRelations = relations(collectionItems, ({ one }) => ({
  collection: one(collections, {
    fields: [collectionItems.collectionId],
    references: [collections.id],
  }),
  recipe: one(recipes, {
    fields: [collectionItems.recipeId],
    references: [recipes.id],
  }),
}));

/**
 * Drizzle relations for notifications: recipient user and triggering actor.
 *
 * Both foreign keys point at `users`, so they are disambiguated via
 * `relationName` (`NotificationRecipient` pairs with `usersRelations.notifications`;
 * `NotificationActor` is a one-directional link to the acting user).
 */
export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
    relationName: 'NotificationRecipient',
  }),
  actor: one(users, {
    fields: [notifications.actorId],
    references: [users.id],
    relationName: 'NotificationActor',
  }),
}));
