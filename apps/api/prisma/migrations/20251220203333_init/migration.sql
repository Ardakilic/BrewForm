-- CreateEnum
CREATE TYPE "UnitSystem" AS ENUM ('METRIC', 'IMPERIAL');

-- CreateEnum
CREATE TYPE "Theme" AS ENUM ('LIGHT', 'DARK', 'COFFEE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('DRAFT', 'PRIVATE', 'UNLISTED', 'PUBLIC');

-- CreateEnum
CREATE TYPE "EmojiRating" AS ENUM ('SUPER_GOOD', 'GOOD', 'OKAY', 'BAD', 'HORRIBLE');

-- CreateEnum
CREATE TYPE "BrewMethodType" AS ENUM ('ESPRESSO_MACHINE', 'MOKA_POT', 'FRENCH_PRESS', 'POUR_OVER_V60', 'POUR_OVER_CHEMEX', 'POUR_OVER_KALITA', 'AEROPRESS', 'COLD_BREW', 'DRIP_COFFEE', 'TURKISH_CEZVE', 'SIPHON', 'VIETNAMESE_PHIN', 'IBRIK', 'PERCOLATOR', 'OTHER');

-- CreateEnum
CREATE TYPE "DrinkType" AS ENUM ('ESPRESSO', 'RISTRETTO', 'LUNGO', 'AMERICANO', 'LATTE', 'CAPPUCCINO', 'FLAT_WHITE', 'CORTADO', 'MACCHIATO', 'MOCHA', 'POUR_OVER', 'FRENCH_PRESS', 'COLD_BREW', 'ICED_COFFEE', 'TURKISH_COFFEE', 'AFFOGATO', 'IRISH_COFFEE', 'VIETNAMESE_COFFEE', 'OTHER');

-- CreateEnum
CREATE TYPE "ProcessingMethod" AS ENUM ('WASHED', 'NATURAL', 'HONEY', 'SEMI_WASHED', 'WET_HULLED', 'ANAEROBIC', 'CARBONIC_MACERATION', 'OTHER');

-- CreateEnum
CREATE TYPE "MilkPreparationType" AS ENUM ('STEAMED', 'FROTHED', 'COLD', 'HEATED', 'NONE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "passwordHash" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "bio" TEXT,
    "website" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "bannedAt" TIMESTAMP(3),
    "bannedReason" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerifiedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "preferredLocale" TEXT NOT NULL DEFAULT 'en',
    "preferredTimezone" TEXT NOT NULL DEFAULT 'UTC',
    "preferredUnits" "UnitSystem" NOT NULL DEFAULT 'METRIC',
    "preferredTheme" "Theme" NOT NULL DEFAULT 'SYSTEM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_resets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "website" TEXT,
    "country" TEXT,
    "description" TEXT,
    "logoUrl" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coffees" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "vendorId" TEXT,
    "origin" TEXT,
    "region" TEXT,
    "farm" TEXT,
    "altitude" INTEGER,
    "variety" TEXT,
    "processingMethod" "ProcessingMethod",
    "flavorNotes" TEXT[],
    "description" TEXT,
    "roastLevel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "coffees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grinders" (
    "id" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" TEXT,
    "burrSize" INTEGER,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "grinders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brewers" (
    "id" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "brewMethod" "BrewMethodType" NOT NULL,
    "type" TEXT,
    "defaultPressure" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "brewers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portafilters" (
    "id" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "size" INTEGER,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "portafilters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "baskets" (
    "id" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "size" INTEGER,
    "type" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "baskets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "puck_screens" (
    "id" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "size" INTEGER,
    "mesh" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "puck_screens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_filters" (
    "id" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" TEXT,
    "size" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "paper_filters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tampers" (
    "id" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "size" INTEGER,
    "type" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tampers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_equipment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "notes" TEXT,
    "grinderId" TEXT,
    "brewerId" TEXT,
    "portafilterId" TEXT,
    "basketId" TEXT,
    "puckScreenId" TEXT,
    "paperFilterId" TEXT,
    "tamperId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "user_equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_beans" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "coffeeId" TEXT NOT NULL,
    "roastDate" TIMESTAMP(3),
    "purchaseDate" TIMESTAMP(3),
    "quantity" INTEGER,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "user_beans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_setups" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "defaultBrewMethod" "BrewMethodType",
    "defaultDrinkType" "DrinkType",
    "defaultDoseGrams" DOUBLE PRECISION,
    "defaultGrindSize" TEXT,
    "defaultTempCelsius" DOUBLE PRECISION,
    "defaultPressure" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "user_setups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_setup_equipment" (
    "id" TEXT NOT NULL,
    "setupId" TEXT NOT NULL,
    "userEquipmentId" TEXT NOT NULL,

    CONSTRAINT "user_setup_equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "currentVersionId" TEXT,
    "visibility" "Visibility" NOT NULL DEFAULT 'DRAFT',
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "favouriteCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "forkedFromId" TEXT,
    "forkCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_versions" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "brewMethod" "BrewMethodType" NOT NULL,
    "drinkType" "DrinkType" NOT NULL,
    "coffeeId" TEXT,
    "coffeeName" TEXT,
    "roastDate" TIMESTAMP(3),
    "grindDate" TIMESTAMP(3),
    "grinderId" TEXT,
    "brewerId" TEXT,
    "portafilterId" TEXT,
    "basketId" TEXT,
    "puckScreenId" TEXT,
    "paperFilterId" TEXT,
    "tamperId" TEXT,
    "grindSize" TEXT,
    "doseGrams" DOUBLE PRECISION NOT NULL,
    "yieldMl" DOUBLE PRECISION,
    "yieldGrams" DOUBLE PRECISION,
    "brewTimeSec" INTEGER,
    "tempCelsius" DOUBLE PRECISION,
    "pressure" TEXT,
    "brewRatio" DOUBLE PRECISION,
    "flowRate" DOUBLE PRECISION,
    "preparations" JSONB,
    "tastingNotes" TEXT,
    "rating" INTEGER,
    "emojiRating" "EmojiRating",
    "isFavourite" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipe_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_favourites" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_favourites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "parentId" TEXT,
    "content" TEXT NOT NULL,
    "isEdited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comparisons" (
    "id" TEXT NOT NULL,
    "shareToken" TEXT NOT NULL,
    "recipeAId" TEXT NOT NULL,
    "recipeBId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comparisons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "oldValues" JSONB,
    "newValues" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_analytics" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventData" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brew_method_compatibility" (
    "id" TEXT NOT NULL,
    "brewMethod" "BrewMethodType" NOT NULL,
    "drinkType" "DrinkType" NOT NULL,
    "isValid" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "brew_method_compatibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_username_idx" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_isBanned_idx" ON "users"("isBanned");

-- CreateIndex
CREATE INDEX "users_deletedAt_idx" ON "users"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refreshToken_key" ON "sessions"("refreshToken");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_token_idx" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "password_resets_token_key" ON "password_resets"("token");

-- CreateIndex
CREATE INDEX "password_resets_token_idx" ON "password_resets"("token");

-- CreateIndex
CREATE INDEX "password_resets_userId_idx" ON "password_resets"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "email_verifications_token_key" ON "email_verifications"("token");

-- CreateIndex
CREATE INDEX "email_verifications_token_idx" ON "email_verifications"("token");

-- CreateIndex
CREATE INDEX "email_verifications_userId_idx" ON "email_verifications"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_name_key" ON "vendors"("name");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_slug_key" ON "vendors"("slug");

-- CreateIndex
CREATE INDEX "vendors_slug_idx" ON "vendors"("slug");

-- CreateIndex
CREATE INDEX "vendors_name_idx" ON "vendors"("name");

-- CreateIndex
CREATE INDEX "vendors_deletedAt_idx" ON "vendors"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "coffees_slug_key" ON "coffees"("slug");

-- CreateIndex
CREATE INDEX "coffees_slug_idx" ON "coffees"("slug");

-- CreateIndex
CREATE INDEX "coffees_vendorId_idx" ON "coffees"("vendorId");

-- CreateIndex
CREATE INDEX "coffees_name_idx" ON "coffees"("name");

-- CreateIndex
CREATE INDEX "coffees_deletedAt_idx" ON "coffees"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "grinders_slug_key" ON "grinders"("slug");

-- CreateIndex
CREATE INDEX "grinders_slug_idx" ON "grinders"("slug");

-- CreateIndex
CREATE INDEX "grinders_deletedAt_idx" ON "grinders"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "grinders_brand_model_key" ON "grinders"("brand", "model");

-- CreateIndex
CREATE UNIQUE INDEX "brewers_slug_key" ON "brewers"("slug");

-- CreateIndex
CREATE INDEX "brewers_slug_idx" ON "brewers"("slug");

-- CreateIndex
CREATE INDEX "brewers_brewMethod_idx" ON "brewers"("brewMethod");

-- CreateIndex
CREATE INDEX "brewers_deletedAt_idx" ON "brewers"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "brewers_brand_model_key" ON "brewers"("brand", "model");

-- CreateIndex
CREATE UNIQUE INDEX "portafilters_slug_key" ON "portafilters"("slug");

-- CreateIndex
CREATE INDEX "portafilters_slug_idx" ON "portafilters"("slug");

-- CreateIndex
CREATE INDEX "portafilters_deletedAt_idx" ON "portafilters"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "baskets_slug_key" ON "baskets"("slug");

-- CreateIndex
CREATE INDEX "baskets_slug_idx" ON "baskets"("slug");

-- CreateIndex
CREATE INDEX "baskets_deletedAt_idx" ON "baskets"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "baskets_brand_model_key" ON "baskets"("brand", "model");

-- CreateIndex
CREATE UNIQUE INDEX "puck_screens_slug_key" ON "puck_screens"("slug");

-- CreateIndex
CREATE INDEX "puck_screens_slug_idx" ON "puck_screens"("slug");

-- CreateIndex
CREATE INDEX "puck_screens_deletedAt_idx" ON "puck_screens"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "paper_filters_slug_key" ON "paper_filters"("slug");

-- CreateIndex
CREATE INDEX "paper_filters_slug_idx" ON "paper_filters"("slug");

-- CreateIndex
CREATE INDEX "paper_filters_deletedAt_idx" ON "paper_filters"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "paper_filters_brand_model_key" ON "paper_filters"("brand", "model");

-- CreateIndex
CREATE UNIQUE INDEX "tampers_slug_key" ON "tampers"("slug");

-- CreateIndex
CREATE INDEX "tampers_slug_idx" ON "tampers"("slug");

-- CreateIndex
CREATE INDEX "tampers_deletedAt_idx" ON "tampers"("deletedAt");

-- CreateIndex
CREATE INDEX "user_equipment_userId_idx" ON "user_equipment"("userId");

-- CreateIndex
CREATE INDEX "user_equipment_deletedAt_idx" ON "user_equipment"("deletedAt");

-- CreateIndex
CREATE INDEX "user_beans_userId_idx" ON "user_beans"("userId");

-- CreateIndex
CREATE INDEX "user_beans_coffeeId_idx" ON "user_beans"("coffeeId");

-- CreateIndex
CREATE INDEX "user_beans_isActive_idx" ON "user_beans"("isActive");

-- CreateIndex
CREATE INDEX "user_beans_deletedAt_idx" ON "user_beans"("deletedAt");

-- CreateIndex
CREATE INDEX "user_setups_userId_idx" ON "user_setups"("userId");

-- CreateIndex
CREATE INDEX "user_setups_isDefault_idx" ON "user_setups"("isDefault");

-- CreateIndex
CREATE INDEX "user_setups_deletedAt_idx" ON "user_setups"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "user_setup_equipment_setupId_userEquipmentId_key" ON "user_setup_equipment"("setupId", "userEquipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "recipes_slug_key" ON "recipes"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "recipes_currentVersionId_key" ON "recipes"("currentVersionId");

-- CreateIndex
CREATE INDEX "recipes_userId_idx" ON "recipes"("userId");

-- CreateIndex
CREATE INDEX "recipes_slug_idx" ON "recipes"("slug");

-- CreateIndex
CREATE INDEX "recipes_visibility_idx" ON "recipes"("visibility");

-- CreateIndex
CREATE INDEX "recipes_forkedFromId_idx" ON "recipes"("forkedFromId");

-- CreateIndex
CREATE INDEX "recipes_deletedAt_idx" ON "recipes"("deletedAt");

-- CreateIndex
CREATE INDEX "recipes_favouriteCount_idx" ON "recipes"("favouriteCount");

-- CreateIndex
CREATE INDEX "recipes_createdAt_idx" ON "recipes"("createdAt");

-- CreateIndex
CREATE INDEX "recipe_versions_recipeId_idx" ON "recipe_versions"("recipeId");

-- CreateIndex
CREATE INDEX "recipe_versions_userId_idx" ON "recipe_versions"("userId");

-- CreateIndex
CREATE INDEX "recipe_versions_brewMethod_idx" ON "recipe_versions"("brewMethod");

-- CreateIndex
CREATE INDEX "recipe_versions_drinkType_idx" ON "recipe_versions"("drinkType");

-- CreateIndex
CREATE INDEX "recipe_versions_coffeeId_idx" ON "recipe_versions"("coffeeId");

-- CreateIndex
CREATE INDEX "recipe_versions_rating_idx" ON "recipe_versions"("rating");

-- CreateIndex
CREATE INDEX "recipe_versions_createdAt_idx" ON "recipe_versions"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_versions_recipeId_versionNumber_key" ON "recipe_versions"("recipeId", "versionNumber");

-- CreateIndex
CREATE INDEX "user_favourites_userId_idx" ON "user_favourites"("userId");

-- CreateIndex
CREATE INDEX "user_favourites_recipeId_idx" ON "user_favourites"("recipeId");

-- CreateIndex
CREATE INDEX "user_favourites_createdAt_idx" ON "user_favourites"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "user_favourites_userId_recipeId_key" ON "user_favourites"("userId", "recipeId");

-- CreateIndex
CREATE INDEX "comments_recipeId_idx" ON "comments"("recipeId");

-- CreateIndex
CREATE INDEX "comments_userId_idx" ON "comments"("userId");

-- CreateIndex
CREATE INDEX "comments_parentId_idx" ON "comments"("parentId");

-- CreateIndex
CREATE INDEX "comments_deletedAt_idx" ON "comments"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "comparisons_shareToken_key" ON "comparisons"("shareToken");

-- CreateIndex
CREATE INDEX "comparisons_shareToken_idx" ON "comparisons"("shareToken");

-- CreateIndex
CREATE UNIQUE INDEX "comparisons_recipeAId_recipeBId_key" ON "comparisons"("recipeAId", "recipeBId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_idx" ON "audit_logs"("entityType");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "user_analytics_userId_idx" ON "user_analytics"("userId");

-- CreateIndex
CREATE INDEX "user_analytics_eventType_idx" ON "user_analytics"("eventType");

-- CreateIndex
CREATE INDEX "user_analytics_createdAt_idx" ON "user_analytics"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "brew_method_compatibility_brewMethod_drinkType_key" ON "brew_method_compatibility"("brewMethod", "drinkType");

-- CreateIndex
CREATE INDEX "rate_limits_expiresAt_idx" ON "rate_limits"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limits_identifier_action_key" ON "rate_limits"("identifier", "action");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coffees" ADD CONSTRAINT "coffees_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_equipment" ADD CONSTRAINT "user_equipment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_equipment" ADD CONSTRAINT "user_equipment_grinderId_fkey" FOREIGN KEY ("grinderId") REFERENCES "grinders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_equipment" ADD CONSTRAINT "user_equipment_brewerId_fkey" FOREIGN KEY ("brewerId") REFERENCES "brewers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_equipment" ADD CONSTRAINT "user_equipment_portafilterId_fkey" FOREIGN KEY ("portafilterId") REFERENCES "portafilters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_equipment" ADD CONSTRAINT "user_equipment_basketId_fkey" FOREIGN KEY ("basketId") REFERENCES "baskets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_equipment" ADD CONSTRAINT "user_equipment_puckScreenId_fkey" FOREIGN KEY ("puckScreenId") REFERENCES "puck_screens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_equipment" ADD CONSTRAINT "user_equipment_paperFilterId_fkey" FOREIGN KEY ("paperFilterId") REFERENCES "paper_filters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_equipment" ADD CONSTRAINT "user_equipment_tamperId_fkey" FOREIGN KEY ("tamperId") REFERENCES "tampers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_beans" ADD CONSTRAINT "user_beans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_beans" ADD CONSTRAINT "user_beans_coffeeId_fkey" FOREIGN KEY ("coffeeId") REFERENCES "coffees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_setups" ADD CONSTRAINT "user_setups_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_setup_equipment" ADD CONSTRAINT "user_setup_equipment_setupId_fkey" FOREIGN KEY ("setupId") REFERENCES "user_setups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_setup_equipment" ADD CONSTRAINT "user_setup_equipment_userEquipmentId_fkey" FOREIGN KEY ("userEquipmentId") REFERENCES "user_equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_forkedFromId_fkey" FOREIGN KEY ("forkedFromId") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "recipe_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_versions" ADD CONSTRAINT "recipe_versions_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_versions" ADD CONSTRAINT "recipe_versions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_versions" ADD CONSTRAINT "recipe_versions_coffeeId_fkey" FOREIGN KEY ("coffeeId") REFERENCES "coffees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_versions" ADD CONSTRAINT "recipe_versions_grinderId_fkey" FOREIGN KEY ("grinderId") REFERENCES "grinders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_versions" ADD CONSTRAINT "recipe_versions_brewerId_fkey" FOREIGN KEY ("brewerId") REFERENCES "brewers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_versions" ADD CONSTRAINT "recipe_versions_portafilterId_fkey" FOREIGN KEY ("portafilterId") REFERENCES "portafilters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_versions" ADD CONSTRAINT "recipe_versions_basketId_fkey" FOREIGN KEY ("basketId") REFERENCES "baskets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_versions" ADD CONSTRAINT "recipe_versions_puckScreenId_fkey" FOREIGN KEY ("puckScreenId") REFERENCES "puck_screens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_versions" ADD CONSTRAINT "recipe_versions_paperFilterId_fkey" FOREIGN KEY ("paperFilterId") REFERENCES "paper_filters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_versions" ADD CONSTRAINT "recipe_versions_tamperId_fkey" FOREIGN KEY ("tamperId") REFERENCES "tampers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_favourites" ADD CONSTRAINT "user_favourites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_favourites" ADD CONSTRAINT "user_favourites_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_recipeAId_fkey" FOREIGN KEY ("recipeAId") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_recipeBId_fkey" FOREIGN KEY ("recipeBId") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_analytics" ADD CONSTRAINT "user_analytics_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
