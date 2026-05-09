import { relations } from 'drizzle-orm';
import {
  AnyPgColumn,
  boolean,
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

// ============================================================
// Enums
// ============================================================

export const visibilityEnum = pgEnum('visibility', [
  'draft',
  'private',
  'unlisted',
  'public',
]);

export type RecipeVisibility = typeof visibilityEnum.enumValues[number];

export const brewMethodEnum = pgEnum('brew_method', [
  'espresso_machine',
  'v60',
  'french_press',
  'aeropress',
  'turkish_coffee',
  'drip_coffee',
  'chemex',
  'kalita_wave',
  'moka_pot',
  'cold_brew',
  'siphon',
]);

export const drinkTypeEnum = pgEnum('drink_type', [
  'espresso',
  'americano',
  'flat_white',
  'latte',
  'cappuccino',
  'cortado',
  'macchiato',
  'turkish_coffee',
  'pour_over',
  'cold_brew',
  'french_press',
]);

export const equipmentTypeEnum = pgEnum('equipment_type', [
  'portafilter',
  'basket',
  'puck_screen',
  'paper_filter',
  'tamper',
  'gooseneck_kettle',
  'mesh_filter',
  'cezve',
  'scale',
  'thermometer',
  'other',
]);

export const emojiTagEnum = pgEnum('emoji_tag', [
  'fire',
  'rocket',
  'thumbsup',
  'neutral',
  'thumbsdown',
  'nauseated',
]);

export const badgeRuleEnum = pgEnum('badge_rule', [
  'first_brew',
  'decade_brewer',
  'centurion',
  'first_fork',
  'fan_favourite',
  'community_star',
  'conversationalist',
  'precision_brewer',
  'explorer',
  'influencer',
]);

export const unitSystemEnum = pgEnum('unit_system', [
  'metric',
  'imperial',
]);

export const temperatureUnitEnum = pgEnum('temperature_unit', [
  'celsius',
  'fahrenheit',
]);

export const themeEnum = pgEnum('theme', [
  'light',
  'dark',
  'coffee',
]);

export const dateFormatEnum = pgEnum('date_format', [
  'DD_MM_YYYY',
  'MM_DD_YYYY',
  'YYYY_MM_DD',
]);

export const additionalPreparationTypeEnum = pgEnum('additional_preparation_type', [
  'milk',
  'water',
  'syrup',
  'spice',
  'other',
]);

// ============================================================
// Tables
// ============================================================

export const users = pgTable(
  'user',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    email: varchar('email', { length: 255 }).notNull().unique(),
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
  newFollower: boolean('new_follower').notNull().default(true),
  recipeLiked: boolean('recipe_liked').notNull().default(true),
  recipeCommented: boolean('recipe_commented').notNull().default(true),
  followedUserPosted: boolean('followed_user_posted').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

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
  ],
);

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
    brewRatio: real('brew_ratio'),
    flowRate: real('flow_rate'),
    personalNotes: text('personal_notes'),
    isFavourite: boolean('is_favourite').notNull().default(false),
    rating: integer('rating'),
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
  ],
);

export const recipeTasteNotes = pgTable(
  'recipe_taste_note',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    recipeVersionId: varchar('recipe_version_id', { length: 36 }).notNull().references(
      () => recipeVersions.id,
      { onDelete: 'cascade' },
    ),
    tasteNoteId: varchar('taste_note_id', { length: 36 }).notNull().references(() => tasteNotes.id),
  },
  (table) => [
    unique('recipe_taste_note_recipe_version_id_taste_note_id_unique').on(
      table.recipeVersionId,
      table.tasteNoteId,
    ),
    index('recipe_taste_note_recipe_version_id_idx').on(table.recipeVersionId),
    index('recipe_taste_note_taste_note_id_idx').on(table.tasteNoteId),
  ],
);

export const recipeEquipment = pgTable(
  'recipe_equipment',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    recipeVersionId: varchar('recipe_version_id', { length: 36 }).notNull().references(
      () => recipeVersions.id,
      { onDelete: 'cascade' },
    ),
    equipmentId: varchar('equipment_id', { length: 36 }).notNull().references(() => equipment.id),
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
  ],
);

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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('equipment_type_idx').on(table.type),
    index('equipment_name_idx').on(table.name),
    index('equipment_deleted_at_idx').on(table.deletedAt),
  ],
);

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
  ],
);

export const vendors = pgTable(
  'vendor',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: varchar('name', { length: 255 }).notNull(),
    website: varchar('website', { length: 500 }),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('vendor_name_idx').on(table.name),
    index('vendor_deleted_at_idx').on(table.deletedAt),
  ],
);

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
  },
  (table) => [
    index('taste_note_parent_id_idx').on(table.parentId),
    index('taste_note_name_idx').on(table.name),
    index('taste_note_depth_idx').on(table.depth),
  ],
);

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
  ],
);

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
  ],
);

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
  ],
);

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

export const reports = pgTable(
  'report',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    reporterId: varchar('reporter_id', { length: 36 }).notNull().references(() => users.id),
    entityType: varchar('entity_type', { length: 100 }).notNull(),
    entityId: varchar('entity_id', { length: 36 }).notNull(),
    reason: text('reason').notNull(),
    status: varchar('status', { length: 50 }).notNull().default('pending'),
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
  ],
);

// ============================================================
// Relations
// ============================================================

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
  setups: many(setups),
  equipment: many(equipment),
  beans: many(beans),
  auditLogs: many(auditLogs),
  passwordResets: many(passwordResets),
  reports: many(reports),
}));

export const userPreferencesRelations = relations(userPreferences, ({ one }) => ({
  user: one(users, {
    fields: [userPreferences.userId],
    references: [users.id],
  }),
}));

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
  forkedFrom: one(recipes, {
    fields: [recipes.forkedFromId],
    references: [recipes.id],
  }),
  forks: many(recipes, { relationName: 'RecipeFork' }),
}));

export const recipeVersionsRelations = relations(recipeVersions, ({ one, many }) => ({
  recipe: one(recipes, {
    fields: [recipeVersions.recipeId],
    references: [recipes.id],
  }),
  vendor: one(vendors, {
    fields: [recipeVersions.vendorId],
    references: [vendors.id],
  }),
  tasteNotes: many(recipeTasteNotes),
  equipment: many(recipeEquipment),
  additionalPreparations: many(recipeAdditionalPreparations),
  versionPhotos: many(recipeVersionPhotos),
}));

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

export const recipeAdditionalPreparationsRelations = relations(
  recipeAdditionalPreparations,
  ({ one }) => ({
    recipeVersion: one(recipeVersions, {
      fields: [recipeAdditionalPreparations.recipeVersionId],
      references: [recipeVersions.id],
    }),
  }),
);

export const photosRelations = relations(photos, ({ one, many }) => ({
  recipe: one(recipes, {
    fields: [photos.recipeId],
    references: [recipes.id],
  }),
  versionPhotos: many(recipeVersionPhotos),
}));

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

export const beansRelations = relations(beans, ({ one }) => ({
  vendor: one(vendors, {
    fields: [beans.vendorId],
    references: [vendors.id],
  }),
  user: one(users, {
    fields: [beans.userId],
    references: [users.id],
  }),
}));

export const vendorsRelations = relations(vendors, ({ many }) => ({
  beans: many(beans),
  recipeVersions: many(recipeVersions),
}));

export const tasteNotesRelations = relations(tasteNotes, ({ one, many }) => ({
  parent: one(tasteNotes, {
    fields: [tasteNotes.parentId],
    references: [tasteNotes.id],
  }),
  children: many(tasteNotes),
  recipeTasteNotes: many(recipeTasteNotes),
}));

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

export const badgesRelations = relations(badges, ({ many }) => ({
  userBadges: many(userBadges),
}));

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

export const brewMethodEquipmentRulesRelations = relations(brewMethodEquipmentRules, () => ({}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  admin: one(users, {
    fields: [auditLogs.adminId],
    references: [users.id],
  }),
}));

export const passwordResetsRelations = relations(passwordResets, ({ one }) => ({
  user: one(users, {
    fields: [passwordResets.userId],
    references: [users.id],
  }),
}));

export const reportsRelations = relations(reports, ({ one }) => ({
  reporter: one(users, {
    fields: [reports.reporterId],
    references: [users.id],
  }),
}));
