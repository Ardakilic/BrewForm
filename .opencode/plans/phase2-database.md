# BrewForm Phase 2 — Database Schema (Prisma)

## Status: READY

## Overview

Create the complete Prisma schema with all models, enums, relations, and indexes. Create the seed script that populates initial data. Follow all database portability rules from §6.2: no raw SQL, no Postgres-specific Prisma features, no `@db.JsonB`, no `@db.Uuid`, no Postgres-specific index types.

---

## File Inventory

### 1. `packages/db/prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============================================================
// Enums
// ============================================================

enum Visibility {
  draft
  private
  unlisted
  public
}

enum BrewMethod {
  espresso_machine
  v60
  french_press
  aeropress
  turkish_coffee
  drip_coffee
  chemex
  kalita_wave
  moka_pot
  cold_brew
  siphon
}

enum DrinkType {
  espresso
  americano
  flat_white
  latte
  cappuccino
  cortado
  macchiato
  turkish_coffee
  pour_over
  cold_brew
  french_press
}

enum EquipmentType {
  portafilter
  basket
  puck_screen
  paper_filter
  tamper
  gooseneck_kettle
  mesh_filter
  cezve
  scale
  thermometer
  other
}

enum EmojiTag {
  fire
  rocket
  thumbsup
  neutral
  thumbsdown
  nauseated
}

enum BadgeRule {
  first_brew
  decade_brewer
  centurion
  first_fork
  fan_favourite
  community_star
  conversationalist
  precision_brewer
  explorer
  influencer
}

enum UnitSystem {
  metric
  imperial
}

enum TemperatureUnit {
  celsius
  fahrenheit
}

enum Theme {
  light
  dark
  coffee
}

enum DateFormat {
  DD_MM_YYYY
  MM_DD_YYYY
  YYYY_MM_DD
}

enum AdditionalPreparationType {
  milk
  water
  syrup
  spice
  other
}

// ============================================================
// Models
// ============================================================

model User {
  id                 String           @id @default(uuid())
  email              String           @unique
  username           String           @unique
  passwordHash       String
  displayName        String?
  avatarUrl          String?
  bio                 String?
  onboardingCompleted Boolean         @default(false)
  isAdmin            Boolean          @default(false)
  isBanned           Boolean          @default(false)
  createdAt          DateTime         @default(now())
  updatedAt          DateTime         @updatedAt
  deletedAt          DateTime?

  preferences        UserPreferences?
  recipes            Recipe[]
  comments           Comment[]
  badges             UserBadge[]
  followsAsFollower  UserFollow[]     @relation("UserFollows")
  followsAsFollowing UserFollow[]     @relation("UserFollowing")
  likes              UserRecipeLike[]
  favourites         UserRecipeFavourite[]
  setups             Setup[]
  equipment          Equipment[]
  beans              Bean[]
  auditLogs          AuditLog[]
  passwordResets     PasswordReset[]

  @@index([email])
  @@index([username])
  @@index([createdAt])
  @@index([deletedAt])
}

model UserPreferences {
  id                  String          @id @default(uuid())
  userId              String          @unique
  unitSystem          UnitSystem      @default(metric)
  temperatureUnit     TemperatureUnit @default(celsius)
  theme               Theme           @default(light)
  locale              String          @default("en")
  timezone            String          @default("UTC")
  dateFormat          DateFormat      @default(YYYY_MM_DD)
  newFollower         Boolean         @default(true)
  recipeLiked         Boolean         @default(true)
  recipeCommented     Boolean         @default(true)
  followedUserPosted  Boolean         @default(true)
  createdAt           DateTime        @default(now())
  updatedAt           DateTime        @updatedAt

  user                User            @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Recipe {
  id                String         @id @default(uuid())
  slug              String         @unique
  title             String
  authorId          String
  visibility        Visibility     @default(draft)
  currentVersionId  String?
  likeCount         Int            @default(0)
  commentCount      Int            @default(0)
  forkCount         Int            @default(0)
  forkedFromId      String?
  featured          Boolean        @default(false)
  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt
  deletedAt         DateTime?

  author            User           @relation(fields: [authorId], references: [id])
  versions          RecipeVersion[]
  photos            Photo[]
  comments          Comment[]
  likes             UserRecipeLike[]
  favourites        UserRecipeFavourite[]
  forkedFrom        Recipe?        @relation("RecipeFork", fields: [forkedFromId], references: [id])
  forks             Recipe[]       @relation("RecipeFork")

  @@index([authorId])
  @@index([visibility])
  @@index([createdAt])
  @@index([likeCount])
  @@index([forkedFromId])
  @@index([slug])
  @@index([deletedAt])
}

model RecipeVersion {
  id                    String           @id @default(uuid())
  recipeId              String
  versionNumber         Int
  productName           String?
  coffeeBrand           String?
  coffeeProcessing      String?
  vendorId              String?
  roastDate             DateTime?
  packageOpenDate       DateTime?
  grindDate             DateTime?
  brewDate              DateTime         @default(now())
  brewMethod            BrewMethod
  drinkType             DrinkType
  brewerDetails         String?
  grinder               String?
  grindSize             String?
  groundWeightGrams     Float?
  extractionTimeSeconds Int?
  extractionVolumeMl    Float?
  temperatureCelsius    Float?
  brewRatio             Float?
  flowRate              Float?
  personalNotes         String?
  isFavourite           Boolean          @default(false)
  rating                 Int?
  emojiTag              EmojiTag?
  createdAt              DateTime         @default(now())

  recipe                 Recipe           @relation(fields: [recipeId], references: [id])
  vendor                 Vendor?          @relation(fields: [vendorId], references: [id])
  tasteNotes             RecipeTasteNote[]
  equipment              RecipeEquipment[]
  additionalPreparations RecipeAdditionalPreparation[]
  versionPhotos          RecipeVersionPhoto[]

  @@unique([recipeId, versionNumber])
  @@index([recipeId])
  @@index([brewMethod])
  @@index([drinkType])
  @@index([createdAt])
}

model RecipeTasteNote {
  id               String       @id @default(uuid())
  recipeVersionId  String
  tasteNoteId      String

  recipeVersion    RecipeVersion @relation(fields: [recipeVersionId], references: [id], onDelete: Cascade)
  tasteNote        TasteNote     @relation(fields: [tasteNoteId], references: [id])

  @@unique([recipeVersionId, tasteNoteId])
  @@index([recipeVersionId])
  @@index([tasteNoteId])
}

model RecipeEquipment {
  id               String        @id @default(uuid())
  recipeVersionId  String
  equipmentId      String

  recipeVersion    RecipeVersion @relation(fields: [recipeVersionId], references: [id], onDelete: Cascade)
  equipment        Equipment     @relation(fields: [equipmentId], references: [id])

  @@unique([recipeVersionId, equipmentId])
  @@index([recipeVersionId])
  @@index([equipmentId])
}

model RecipeAdditionalPreparation {
  id                String   @id @default(uuid())
  recipeVersionId   String
  name              String
  type              String
  inputAmount        String
  preparationType   String
  sortOrder          Int      @default(0)

  recipeVersion     RecipeVersion @relation(fields: [recipeVersionId], references: [id], onDelete: Cascade)

  @@index([recipeVersionId])
}

model Photo {
  id           String    @id @default(uuid())
  recipeId     String
  url          String
  thumbnailUrl String?
  alt          String?
  sortOrder    Int       @default(0)
  createdAt    DateTime  @default(now())
  deletedAt    DateTime?

  recipe       Recipe    @relation(fields: [recipeId], references: [id])
  versionPhotos RecipeVersionPhoto[]

  @@index([recipeId])
  @@index([deletedAt])
}

model RecipeVersionPhoto {
  id               String       @id @default(uuid())
  recipeVersionId  String
  photoId          String
  sortOrder        Int          @default(0)

  recipeVersion    RecipeVersion @relation(fields: [recipeVersionId], references: [id], onDelete: Cascade)
  photo            Photo         @relation(fields: [photoId], references: [id])

  @@unique([recipeVersionId, photoId])
  @@index([recipeVersionId])
  @@index([photoId])
}

model Equipment {
  id          String        @id @default(uuid())
  name        String
  type        EquipmentType
  brand       String?
  model       String?
  description String?
  createdBy   String?
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  deletedAt   DateTime?

  recipeEquipment RecipeEquipment[]

  @@index([type])
  @@index([name])
  @@index([deletedAt])
}

model Bean {
  id          String    @id @default(uuid())
  name        String
  brand       String?
  vendorId    String?
  roaster     String?
  roastLevel  String?
  processing  String?
  origin      String?
  userId      String
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?

  vendor      Vendor?   @relation(fields: [vendorId], references: [id])
  user        User      @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([deletedAt])
}

model Vendor {
  id          String    @id @default(uuid())
  name        String
  website     String?
  description String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?

  beans       Bean[]
  recipeVersions RecipeVersion[]

  @@index([name])
  @@index([deletedAt])
}

model TasteNote {
  id         String     @id @default(uuid())
  name       String
  parentId   String?
  color      String?
  definition String?
  depth      Int        @default(0)
  createdAt  DateTime   @default(now())

  parent     TasteNote? @relation("TasteNoteHierarchy", fields: [parentId], references: [id])
  children   TasteNote[] @relation("TasteNoteHierarchy")
  recipeTasteNotes RecipeTasteNote[]

  @@index([parentId])
  @@index([name])
  @@index([depth])
}

model Setup {
  id             String    @id @default(uuid())
  name           String
  userId         String
  brewerDetails  String?
  grinder        String?
  portafilterId  String?
  basketId       String?
  puckScreenId   String?
  paperFilterId  String?
  tamperId       String?
  isDefault      Boolean   @default(false)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  deletedAt      DateTime?

  user            User          @relation(fields: [userId], references: [id])
  portafilter     Equipment?   @relation("SetupPortafilter", fields: [portafilterId], references: [id])
  basket          Equipment?   @relation("SetupBasket", fields: [basketId], references: [id])
  puckScreen      Equipment?   @relation("SetupPuckScreen", fields: [puckScreenId], references: [id])
  paperFilter     Equipment?   @relation("SetupPaperFilter", fields: [paperFilterId], references: [id])
  tamper          Equipment?   @relation("SetupTamper", fields: [tamperId], references: [id])

  @@index([userId])
  @@index([deletedAt])
}

model Comment {
  id              String    @id @default(uuid())
  recipeId        String
  authorId        String
  content         String
  parentCommentId String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  deletedAt       DateTime?

  recipe          Recipe    @relation(fields: [recipeId], references: [id])
  author          User      @relation(fields: [authorId], references: [id])
  parentComment   Comment?  @relation("CommentReplies", fields: [parentCommentId], references: [id])
  replies         Comment[] @relation("CommentReplies")

  @@index([recipeId])
  @@index([authorId])
  @@index([parentCommentId])
  @@index([createdAt])
  @@index([deletedAt])
}

model UserFollow {
  id          String   @id @default(uuid())
  followerId  String
  followingId String
  createdAt   DateTime @default(now())

  follower    User     @relation("UserFollows", fields: [followerId], references: [id])
  following   User     @relation("UserFollowing", fields: [followingId], references: [id])

  @@unique([followerId, followingId])
  @@index([followerId])
  @@index([followingId])
  @@index([createdAt])
}

model UserRecipeFavourite {
  id        String   @id @default(uuid())
  userId    String
  recipeId  String
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id])
  recipe    Recipe   @relation(fields: [recipeId], references: [id])

  @@unique([userId, recipeId])
  @@index([userId])
  @@index([recipeId])
  @@index([createdAt])
}

model UserRecipeLike {
  id        String   @id @default(uuid())
  userId    String
  recipeId  String
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id])
  recipe    Recipe   @relation(fields: [recipeId], references: [id])

  @@unique([userId, recipeId])
  @@index([userId])
  @@index([recipeId])
  @@index([createdAt])
}

model Badge {
  id          String    @id @default(uuid())
  name        String
  icon        String
  description String
  rule        BadgeRule
  threshold   Int
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  userBadges  UserBadge[]

  @@unique([rule])
  @@index([rule])
}

model UserBadge {
  id        String   @id @default(uuid())
  userId    String
  badgeId   String
  awardedAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id])
  badge     Badge    @relation(fields: [badgeId], references: [id])

  @@unique([userId, badgeId])
  @@index([userId])
  @@index([badgeId])
}

model BrewMethodEquipmentRule {
  id             String        @id @default(uuid())
  brewMethod     BrewMethod
  equipmentType  EquipmentType
  compatible     Boolean       @default(true)
  createdAt      DateTime      @default(now())

  @@unique([brewMethod, equipmentType])
  @@index([brewMethod])
  @@index([equipmentType])
}

model AuditLog {
  id        String   @id @default(uuid())
  adminId   String
  action    String
  entity    String
  entityId  String?
  details   String?
  createdAt DateTime @default(now())

  admin     User     @relation(fields: [adminId], references: [id])

  @@index([adminId])
  @@index([entity])
  @@index([createdAt])
}

model PasswordReset {
  id        String    @id @default(uuid())
  userId    String
  token     String    @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  user      User      @relation(fields: [userId], references: [id])

  @@index([token])
  @@index([userId])
  @@index([expiresAt])
}
```

**Design decisions:**

- All IDs are UUID strings via `@default(uuid())`. We do NOT use `@db.Uuid` to maintain portability across databases (per §6.2).
- All models have soft deletes via `deletedAt DateTime?`. Queries must filter `deletedAt: null`.
- `EmojiTag` enum stores stable keys (`fire`, `rocket`, `thumbsup`, etc.) instead of actual emoji characters, keeping the schema database-portable. The mapping from enum values to display emoji lives in `@brewform/shared/constants/emoji-tags.ts`.
- `UserPreferences` has a separate table with a unique `userId` for 1:1 relation. Email notification booleans stored as individual columns (not JSON) for portability (no `@db.JsonB`).
- `RecipeVersion` is immutable — no `updatedAt` field, only `createdAt`.
- `RecipeTasteNote` and `RecipeEquipment` are many-to-many pivot tables with `@@unique` composite constraints.
- `RecipeAdditionalPreparation` stores freeform additions per version with a `sortOrder` field.
- `Comment` has a self-referential `parentCommentId` to support threaded replies.
- `UserFollow`, `UserRecipeLike`, `UserRecipeFavourite` all have `@@unique` composite constraints to prevent duplicates.
- `BrewMethodEquipmentRule` encodes the compatibility matrix from §3.15 with `@@unique([brewMethod, equipmentType])`.
- `AuditLog.details` is a plain `String?` for portability. If structured details are needed, they can be serialized as JSON strings in application code.
- `Setup` has optional FK references to `Equipment` for portafilter, basket, puck screen, paper filter, and tamper — matching the brew setup concept from §3.1.

---

### 2. `packages/db/prisma/seed.ts`

```typescript
import { PrismaClient } from '@prisma/client';
import { hashSync } from 'bcryptjs';
import { readFileSync } from 'node:fs';

const prisma = new PrismaClient();

interface ScaaTasteNote {
  name: string;
  children?: ScaaTasteNote[];
}

interface ScaaRoot {
  name: string;
  children: ScaaTasteChild[];
}

interface ScaaChild {
  name: string;
  children?: ScaaTasteGrandChild[];
}

interface ScaaTasteChild {
  name: string;
  children?: ScaaTasteGrandChild[];
}

interface ScaaTasteGrandChild {
  name: string;
}

function parseScaaData(data: ScaaRoot[]): Array<{ name: string; parentId: string | null; depth: number; color?: string; definition?: string }> {
  const notes: Array<{ name: string; parentId: string | null; depth: number; color?: string; definition?: string }> = [];

  for (const root of data) {
    notes.push({ name: root.name, parentId: null, depth: 0 });

    if (root.children) {
      for (const child of root.children) {
        notes.push({ name: child.name, parentId: null, depth: 1 });

        if (child.children) {
          for (const grandChild of child.children) {
            notes.push({ name: grandChild.name, parentId: null, depth: 2 });
          }
        }
      }
    }
  }

  return notes;
}

async function seedTasteNotes(tx: PrismaClient, data: ScaaRoot[]) {
  for (const root of data) {
    const rootNote = await tx.tasteNote.create({
      data: { name: root.name, depth: 0 },
    });

    if (root.children) {
      for (const child of root.children) {
        const childNote = await tx.tasteNote.create({
          data: { name: child.name, parentId: rootNote.id, depth: 1 },
        });

        if (child.children) {
          for (const grandChild of child.children) {
            await tx.tasteNote.create({
              data: { name: grandChild.name, parentId: childNote.id, depth: 2 },
            });
          }
        }
      }
    }
  }
}

async function seedBrewMethodCompatibility(tx: PrismaClient) {
  const rules: Array<{ brewMethod: string; equipmentType: string; compatible: boolean }> = [
    { brewMethod: 'espresso_machine', equipmentType: 'portafilter', compatible: true },
    { brewMethod: 'espresso_machine', equipmentType: 'basket', compatible: true },
    { brewMethod: 'espresso_machine', equipmentType: 'tamper', compatible: true },
    { brewMethod: 'espresso_machine', equipmentType: 'puck_screen', compatible: true },
    { brewMethod: 'espresso_machine', equipmentType: 'scale', compatible: true },

    { brewMethod: 'v60', equipmentType: 'paper_filter', compatible: true },
    { brewMethod: 'v60', equipmentType: 'gooseneck_kettle', compatible: true },
    { brewMethod: 'v60', equipmentType: 'scale', compatible: true },

    { brewMethod: 'french_press', equipmentType: 'mesh_filter', compatible: true },
    { brewMethod: 'french_press', equipmentType: 'scale', compatible: true },

    { brewMethod: 'aeropress', equipmentType: 'paper_filter', compatible: true },
    { brewMethod: 'aeropress', equipmentType: 'scale', compatible: true },

    { brewMethod: 'turkish_coffee', equipmentType: 'cezve', compatible: true },

    { brewMethod: 'drip_coffee', equipmentType: 'paper_filter', compatible: true },
    { brewMethod: 'drip_coffee', equipmentType: 'scale', compatible: true },

    { brewMethod: 'chemex', equipmentType: 'paper_filter', compatible: true },
    { brewMethod: 'chemex', equipmentType: 'gooseneck_kettle', compatible: true },
    { brewMethod: 'chemex', equipmentType: 'scale', compatible: true },

    { brewMethod: 'kalita_wave', equipmentType: 'paper_filter', compatible: true },
    { brewMethod: 'kalita_wave', equipmentType: 'gooseneck_kettle', compatible: true },
    { brewMethod: 'kalita_wave', equipmentType: 'scale', compatible: true },

    { brewMethod: 'moka_pot', equipmentType: 'scale', compatible: true },

    { brewMethod: 'cold_brew', equipmentType: 'mesh_filter', compatible: true },
    { brewMethod: 'cold_brew', equipmentType: 'scale', compatible: true },

    { brewMethod: 'siphon', equipmentType: 'scale', compatible: true },
    { brewMethod: 'siphon', equipmentType: 'thermometer', compatible: true },

    { brewMethod: 'espresso_machine', equipmentType: 'paper_filter', compatible: false },
    { brewMethod: 'espresso_machine', equipmentType: 'mesh_filter', compatible: false },
    { brewMethod: 'espresso_machine', equipmentType: 'gooseneck_kettle', compatible: false },
    { brewMethod: 'v60', equipmentType: 'portafilter', compatible: false },
    { brewMethod: 'v60', equipmentType: 'tamper', compatible: false },
    { brewMethod: 'turkish_coffee', equipmentType: 'portafilter', compatible: false },
  ];

  for (const rule of rules) {
    await tx.brewMethodEquipmentRule.create({
      data: {
        brewMethod: rule.brewMethod as any,
        equipmentType: rule.equipmentType as any,
        compatible: rule.compatible,
      },
    });
  }
}

async function seedBadges(tx: PrismaClient) {
  const badges = [
    { name: 'First Brew', icon: 'coffee', rule: 'first_brew' as const, description: 'Logged your first recipe', threshold: 1 },
    { name: 'Decade Brewer', icon: 'ten', rule: 'decade_brewer' as const, description: '10 recipes logged', threshold: 10 },
    { name: 'Centurion', icon: '100', rule: 'centurion' as const, description: '100 recipes logged', threshold: 100 },
    { name: 'First Fork', icon: 'fork_and_knife', rule: 'first_fork' as const, description: 'Forked your first recipe', threshold: 1 },
    { name: 'Fan Favourite', icon: 'star', rule: 'fan_favourite' as const, description: 'One of your recipes received 10+ likes', threshold: 10 },
    { name: 'Community Star', icon: 'star2', rule: 'community_star' as const, description: 'One of your recipes received 50+ likes', threshold: 50 },
    { name: 'Conversationalist', icon: 'speech_balloon', rule: 'conversationalist' as const, description: 'Left 10+ comments', threshold: 10 },
    { name: 'Precision Brewer', icon: 'dart', rule: 'precision_brewer' as const, description: 'Logged 10 recipes with all optional fields filled', threshold: 10 },
    { name: 'Explorer', icon: 'globe', rule: 'explorer' as const, description: 'Brewed with 5+ different brew methods', threshold: 5 },
    { name: 'Influencer', icon: 'busts_in_silhouette', rule: 'influencer' as const, description: 'Gained 25+ followers', threshold: 25 },
  ];

  for (const badge of badges) {
    await tx.badge.create({ data: badge });
  }
}

async function seedUsers(tx: PrismaClient) {
  const adminPassword = hashSync('admin123456', 10);
  const user1Password = hashSync('user123456', 10);
  const user2Password = hashSync('user123456', 10);

  const admin = await tx.user.create({
    data: {
      email: 'admin@brewform.local',
      username: 'admin',
      passwordHash: adminPassword,
      displayName: 'BrewForm Admin',
      isAdmin: true,
      onboardingCompleted: true,
      preferences: {
        create: {},
      },
    },
  });

  const user1 = await tx.user.create({
    data: {
      email: 'alice@example.com',
      username: 'alice',
      passwordHash: user1Password,
      displayName: 'Alice Brewer',
      bio: 'Espresso enthusiast from Portland',
      onboardingCompleted: true,
      preferences: {
        create: { unitSystem: 'metric', theme: 'coffee' },
      },
    },
  });

  const user2 = await tx.user.create({
    data: {
      email: 'bob@example.com',
      username: 'bob',
      passwordHash: user2Password,
      displayName: 'Bob Barista',
      bio: 'V60 lover and specialty coffee nerd',
      onboardingCompleted: true,
      preferences: {
        create: { unitSystem: 'metric', theme: 'dark' },
      },
    },
  });

  return { admin, user1, user2 };
}

async function seedRecipes(tx: PrismaClient, users: { admin: any; user1: any; user2: any }) {
  const portafilter = await tx.equipment.create({
    data: { name: 'Bottomless Portafilter 58mm', type: 'portafilter', brand: 'Lelit', createdBy: users.user1.id },
  });

  const basket = await tx.equipment.create({
    data: { name: 'IMS H24 18g', type: 'basket', brand: 'IMS', createdBy: users.user1.id },
  });

  const tamper = await tx.equipment.create({
    data: { name: 'Normcore 58.5mm Spring Tamper', type: 'tamper', brand: 'Normcore', createdBy: users.user1.id },
  });

  const puckScreen = await tx.equipment.create({
    data: { name: 'Metal Puck Screen 58.5mm', type: 'puck_screen', brand: 'Sieve', createdBy: users.user1.id },
  });

  const gooseneck = await tx.equipment.create({
    data: { name: 'Fellow Stagg EKG', type: 'gooseneck_kettle', brand: 'Fellow', createdBy: users.user2.id },
  });

  const v60Filter = await tx.equipment.create({
    data: { name: 'Hario V60 Paper Filter 02', type: 'paper_filter', brand: 'Hario', createdBy: users.user2.id },
  });

  const scale = await tx.equipment.create({
    data: { name: 'Acaia Lunar', type: 'scale', brand: 'Acaia', description: 'High-precision espresso scale', createdBy: users.user1.id },
  });

  const vendor1 = await tx.vendor.create({
    data: { name: 'Heart Coffee Roasters', website: 'https://heartroasters.com', description: 'Portland-based specialty coffee roaster' },
  });

  const bean1 = await tx.bean.create({
    data: { name: 'Heart Ethiopia Yirgacheffe', brand: 'Heart', vendorId: vendor1.id, roaster: 'Heart Coffee Roasters', roastLevel: 'light', processing: 'washed', origin: 'Ethiopia, Yirgacheffe', userId: users.user1.id },
  });

  const recipe1 = await tx.recipe.create({
    data: {
      slug: 'alices-signature-espresso',
      title: "Alice's Signature Espresso",
      authorId: users.user1.id,
      visibility: 'public',
      likeCount: 5,
      commentCount: 2,
      forkCount: 1,
      featured: true,
      versions: {
        create: {
          versionNumber: 1,
          productName: 'Heart Ethiopia Yirgacheffe',
          coffeeBrand: 'Heart',
          coffeeProcessing: 'washed',
          vendorId: vendor1.id,
          roastDate: new Date('2026-03-15'),
          packageOpenDate: new Date('2026-04-01'),
          grindDate: new Date('2026-04-10'),
          brewDate: new Date('2026-04-15'),
          brewMethod: 'espresso_machine',
          drinkType: 'espresso',
          brewerDetails: 'Lelit Mara X',
          grinder: 'Lelit Fred',
          grindSize: '12',
          groundWeightGrams: 18,
          extractionTimeSeconds: 28,
          extractionVolumeMl: 36,
          temperatureCelsius: 93,
          brewRatio: 2.0,
          flowRate: 1.29,
          personalNotes: 'Beautiful sweet shot with floral notes and a honey finish.',
          isFavourite: true,
          rating: 9,
          emojiTag: 'fire',
          equipment: {
            create: [
              { equipmentId: portafilter.id },
              { equipmentId: basket.id },
              { equipmentId: tamper.id },
              { equipmentId: puckScreen.id },
              { equipmentId: scale.id },
            ],
          },
        },
      },
    },
  });

  await tx.recipe.update({
    where: { id: recipe1.id },
    data: { currentVersionId: recipe1.versions[0]?.id },
  });

  const recipe2 = await tx.recipe.create({
    data: {
      slug: 'bobs-morning-v60',
      title: "Bob's Morning V60",
      authorId: users.user2.id,
      visibility: 'public',
      likeCount: 3,
      featured: false,
      versions: {
        create: {
          versionNumber: 1,
          productName: 'Heart Ethiopia Yirgacheffe',
          coffeeBrand: 'Heart',
          coffeeProcessing: 'washed',
          vendorId: vendor1.id,
          roastDate: new Date('2026-03-15'),
          brewDate: new Date('2026-04-12'),
          brewMethod: 'v60',
          drinkType: 'pour_over',
          brewerDetails: 'Hario V60 02',
          grinder: 'Baratza Encore',
          grindSize: '20',
          groundWeightGrams: 15,
          extractionTimeSeconds: 210,
          extractionVolumeMl: 250,
          temperatureCelsius: 96,
          brewRatio: 16.67,
          flowRate: 1.19,
          personalNotes: 'Clean, bright cup. Great morning brew.',
          isFavourite: true,
          rating: 8,
          emojiTag: 'rocket',
          equipment: {
            create: [
              { equipmentId: gooseneck.id },
              { equipmentId: v60Filter.id },
            ],
          },
        },
      },
    },
  });

  await tx.recipe.update({
    where: { id: recipe2.id },
    data: { currentVersionId: recipe2.versions[0]?.id },
  });

  return { recipe1, recipe2 };
}

async function seedSocialData(tx: PrismaClient, users: { admin: any; user1: any; user2: any }, recipes: { recipe1: any; recipe2: any }) {
  await tx.userFollow.create({
    data: { followerId: users.user2.id, followingId: users.user1.id },
  });

  await tx.userRecipeLike.create({
    data: { userId: users.user2.id, recipeId: recipes.recipe1.id },
  });

  await tx.userRecipeFavourite.create({
    data: { userId: users.user2.id, recipeId: recipes.recipe1.id },
  });

  await tx.comment.create({
    data: { recipeId: recipes.recipe1.id, authorId: users.user2.id, content: 'Amazing shot! What Grinder setting are you using?' },
  });

  await tx.comment.create({
    data: { recipeId: recipes.recipe1.id, authorId: users.user1.id, content: 'Thanks! Setting 12 on the Lelit Fred.', parentCommentId: null },
  });

  await tx.userBadge.create({
    data: { userId: users.user1.id, badgeId: (await tx.badge.findFirst({ where: { rule: 'first_brew' } }))!.id },
  });
}

async function seedSetups(tx: PrismaClient, users: { admin: any; user1: any; user2: any }, equipment: any) {
  await tx.setup.create({
    data: {
      name: "Alice's Espresso Setup",
      userId: users.user1.id,
      brewerDetails: 'Lelit Mara X',
      grinder: 'Lelit Fred',
      portafilterId: equipment.portafilter.id,
      basketId: equipment.basket.id,
      puckScreenId: equipment.puckScreen.id,
      tamperId: equipment.tamper.id,
      isDefault: true,
    },
  });

  await tx.setup.create({
    data: {
      name: "Bob's V60 Setup",
      userId: users.user2.id,
      brewerDetails: 'Hario V60 02',
      grinder: 'Baratza Encore',
      isDefault: true,
    },
  });
}

async function main() {
  console.log('Seeding database...');

  await seedBrewMethodCompatibility(prisma);
  await seedBadges(prisma);

  const users = await seedUsers(prisma);
  const recipes = await seedRecipes(prisma, users);
  const equipment = {
    portafilter: await prisma.equipment.findFirst({ where: { name: 'Bottomless Portafilter 58mm' } }),
    basket: await prisma.equipment.findFirst({ where: { name: 'IMS H24 18g' } }),
    puckScreen: await prisma.equipment.findFirst({ where: { name: 'Metal Puck Screen 58.5mm' } }),
    tamper: await prisma.equipment.findFirst({ where: { name: 'Normcore 58.5mm Spring Tamper' } }),
  };

  await seedSocialData(prisma, users, recipes);
  await seedSetups(prisma, users, equipment);

  const scaaData = JSON.parse(readFileSync('./files/scaa-2.json', 'utf-8'));
  await seedTasteNotes(prisma, scaaData);

  console.log('Seeding complete!');
  console.log('Admin credentials: admin@brewform.local / admin123456');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

---

## Migration Commands

After writing the schema and seed script, run:

```bash
make db-generate          # Generate Prisma client from schema
docker compose up -d      # Start postgres
docker compose exec app npx prisma migrate dev --name init --schema=packages/db/prisma/schema.prisma
make db-seed              # Run seed script
```

## Verification Steps

1. `npx prisma validate --schema=packages/db/prisma/schema.prisma` — should pass
2. `npx prisma generate --schema=packages/db/prisma/schema.prisma` — should generate client
3. After migration, verify all tables exist with expected columns
4. After seeding, verify: admin user exists, taste notes are populated, brew method rules exist, badges exist, sample recipes with versions exist

## Key Design Decisions

- **No `@db.Uuid` or `@db.JsonB`** — all IDs use Prisma's `@default(uuid())` which generates UUID strings. Preferences are individual columns, not JSON. This maintains database portability per §6.2.
- **Soft deletes everywhere** — `deletedAt DateTime?` on all main entities. Queries must always include `where: { deletedAt: null }`.
- **EmojiTag enum stores stable keys** — mapping to actual emoji characters is in `@brewform/shared/constants/emoji-tags.ts` to avoid database encoding issues.
- **AuditLog.details is `String?`** — not JSON, for portability. Application code serializes/deserializes if needed.
- **RecipeVersion is immutable** — no `updatedAt` column. Once created, the version cannot be modified.
- **Recipe slug is unique** — used for URLs instead of IDs.
- **Setup has nullable FK references to Equipment** — allows partial setups where a user hasn't specified every piece.