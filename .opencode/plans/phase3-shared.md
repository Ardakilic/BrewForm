# BrewForm Phase 3 — Shared Package

## Status: READY

## Overview

Verify all files from Phase 1's shared package exist and add any missing types, schemas, constants, and utility files. Ensure all types match the Prisma schema models from Phase 2. Add any shared types/schemas not covered in Phase 1.

---

## Inventory Verification

Phase 1 created these shared package files. Verify each exists:

### Types (`packages/shared/src/types/`)
- `index.ts` — barrel export
- `api.ts` — ApiResponse, ApiError, PaginationMeta
- `user.ts` — User, UserProfile, UserPreferences
- `recipe.ts` — Recipe, RecipeVersion, RecipeCreateInput, RecipeUpdateInput
- `equipment.ts` — Equipment, EquipmentType, Portafilter, Basket, etc.
- `taste.ts` — TasteNote, TasteHierarchy, TasteSelection
- `bean.ts` — Bean, Vendor
- `setup.ts` — Setup
- `comment.ts` — Comment
- `follow.ts` — Follow
- `badge.ts` — Badge, BadgeRule, UserBadge
- `photo.ts` — Photo

### Missing types to add:

#### `packages/shared/src/types/setup.ts` — UPDATE

The Setup type needs to include equipment reference IDs to match Phase 2's Prisma schema:

```typescript
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
```

#### `packages/shared/src/types/audit.ts` — NEW FILE

```typescript
export interface AuditLog {
  id: string;
  adminId: string;
  action: string;
  entity: string;
  entityId: string | null;
  details: string | null;
  createdAt: Date;
}
```

#### `packages/shared/src/types/password-reset.ts` — NEW FILE

```typescript
export interface PasswordReset {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}
```

#### `packages/shared/src/types/additional-preparation.ts` — NEW FILE

```typescript
export interface RecipeAdditionalPreparation {
  id: string;
  recipeVersionId: string;
  name: string;
  type: string;
  inputAmount: string;
  preparationType: string;
  sortOrder: number;
}
```

#### `packages/shared/src/types/brew-method-rule.ts` — NEW FILE

```typescript
import type { BrewMethod, EquipmentType } from './recipe.ts';

export interface BrewMethodEquipmentRule {
  id: string;
  brewMethod: BrewMethod;
  equipmentType: EquipmentType;
  compatible: boolean;
  createdAt: Date;
}
```

#### `packages/shared/src/types/index.ts` — UPDATE

Add the new type exports:

```typescript
export type { ApiResponse, ApiError, PaginationMeta, PaginationQuery } from './api.ts';
export type { User, UserProfile, UserPreferences } from './user.ts';
export type { Recipe, RecipeVersion, RecipeCreateInput, RecipeUpdateInput, AdditionalPreparation } from './recipe.ts';
export type { Equipment, Portafilter, Basket, PuckScreen, PaperFilter, Tamper } from './equipment.ts';
export type { TasteNote, TasteHierarchy, TasteSelection } from './taste.ts';
export type { Bean, Vendor } from './bean.ts';
export type { Setup } from './setup.ts';
export type { Comment } from './comment.ts';
export type { Follow } from './follow.ts';
export type { Badge, UserBadge, BadgeRule } from './badge.ts';
export type { Photo } from './photo.ts';
export type { AuditLog } from './audit.ts';
export type { PasswordReset } from './password-reset.ts';
export type { RecipeAdditionalPreparation } from './additional-preparation.ts';
export type { BrewMethodEquipmentRule } from './brew-method-rule.ts';
```

---

### Schemas (`packages/shared/src/schemas/`)

Verify existing schemas and add missing ones:

#### `packages/shared/src/schemas/setup.ts` — NEW FILE

```typescript
import { z } from 'zod';
import { UuidSchema } from './common.ts';

export const SetupCreateSchema = z.object({
  name: z.string().min(1).max(100),
  brewerDetails: z.string().max(200).optional(),
  grinder: z.string().max(200).optional(),
  portafilterId: UuidSchema.optional(),
  basketId: UuidSchema.optional(),
  puckScreenId: UuidSchema.optional(),
  paperFilterId: UuidSchema.optional(),
  tamperId: UuidSchema.optional(),
  isDefault: z.boolean().default(false),
});

export const SetupUpdateSchema = SetupCreateSchema.partial();
```

#### `packages/shared/src/schemas/comment.ts` — NEW FILE

```typescript
import { z } from 'zod';

export const CommentCreateSchema = z.object({
  content: z.string().min(1).max(5000),
  parentCommentId: z.string().uuid().optional(),
});
```

#### `packages/shared/src/schemas/bean.ts` — NEW FILE

```typescript
import { z } from 'zod';

export const BeanCreateSchema = z.object({
  name: z.string().min(1).max(200),
  brand: z.string().max(200).optional(),
  vendorId: z.string().uuid().optional(),
  roaster: z.string().max(200).optional(),
  roastLevel: z.string().max(100).optional(),
  processing: z.string().max(100).optional(),
  origin: z.string().max(200).optional(),
});

export const BeanUpdateSchema = BeanCreateSchema.partial();
```

#### `packages/shared/src/schemas/vendor.ts` — NEW FILE

```typescript
import { z } from 'zod';

export const VendorCreateSchema = z.object({
  name: z.string().min(1).max(200),
  website: z.string().url().optional().or(z.literal('')),
  description: z.string().max(1000).optional(),
});

export const VendorUpdateSchema = VendorCreateSchema.partial();
```

#### `packages/shared/src/schemas/badge.ts` — NEW FILE

```typescript
import { z } from 'zod';

const BadgeRuleEnum = z.enum([
  'first_brew', 'decade_brewer', 'centurion', 'first_fork',
  'fan_favourite', 'community_star', 'conversationalist',
  'precision_brewer', 'explorer', 'influencer',
]);

export const BadgeCreateSchema = z.object({
  name: z.string().min(1).max(100),
  icon: z.string().min(1).max(50),
  description: z.string().min(1).max(500),
  rule: BadgeRuleEnum,
  threshold: z.number().int().positive(),
});

export const BadgeUpdateSchema = BadgeCreateSchema.partial();
```

#### `packages/shared/src/schemas/admin.ts` — NEW FILE

```typescript
import { z } from 'zod';
import { UuidSchema } from './common.ts';

export const AdminBanUserSchema = z.object({
  userId: UuidSchema,
  banned: z.boolean(),
});

export const AdminModifyRecipeVisibilitySchema = z.object({
  recipeId: UuidSchema,
  visibility: z.enum(['draft', 'private', 'unlisted', 'public']),
});

export const AdminFlushCacheSchema = z.object({
  keys: z.array(z.string()).min(1),
});
```

#### `packages/shared/src/schemas/photo.ts` — NEW FILE

```typescript
import { z } from 'zod';
import { UuidSchema } from './common.ts';

export const PhotoUploadSchema = z.object({
  recipeId: UuidSchema,
  alt: z.string().max(200).optional(),
  sortOrder: z.number().int().min(0).default(0),
});
```

#### `packages/shared/src/schemas/follow.ts` — NEW FILE

```typescript
import { z } from 'zod';
import { UuidSchema } from './common.ts';

export const FollowSchema = z.object({
  userId: UuidSchema,
});
```

#### `packages/shared/src/schemas/search.ts` — NEW FILE

```typescript
import { z } from 'zod';
import { PaginationSchema } from './common.ts';

const BrewMethodEnum = z.enum([
  'espresso_machine', 'v60', 'french_press', 'aeropress',
  'turkish_coffee', 'drip_coffee', 'chemex', 'kalita_wave',
  'moka_pot', 'cold_brew', 'siphon',
]);

const DrinkTypeEnum = z.enum([
  'espresso', 'americano', 'flat_white', 'latte',
  'cappuccino', 'cortado', 'macchiato', 'turkish_coffee',
  'pour_over', 'cold_brew', 'french_press',
]);

const VisibilityEnum = z.enum(['draft', 'private', 'unlisted', 'public']);

export const SearchSchema = PaginationSchema.extend({
  q: z.string().optional(),
  brewMethod: BrewMethodEnum.optional(),
  drinkType: DrinkTypeEnum.optional(),
  visibility: VisibilityEnum.optional(),
  authorId: UuidSchema.optional(),
  grinder: z.string().optional(),
  sortBy: z.enum(['createdAt', 'likeCount', 'rating']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
```

#### `packages/shared/src/schemas/index.ts` — UPDATE

```typescript
export { RecipeCreateSchema, RecipeUpdateSchema, RecipeFilterSchema } from './recipe.ts';
export { EquipmentCreateSchema, EquipmentUpdateSchema } from './equipment.ts';
export { AuthRegisterSchema, AuthLoginSchema, AuthRefreshSchema, PasswordResetSchema, PasswordResetConfirmSchema } from './auth.ts';
export { UserPreferencesSchema, UserProfileUpdateSchema } from './user.ts';
export { TasteNoteFilterSchema } from './taste.ts';
export { PaginationSchema, SortOrderSchema, UuidSchema, SlugSchema } from './common.ts';
export { SetupCreateSchema, SetupUpdateSchema } from './setup.ts';
export { CommentCreateSchema } from './comment.ts';
export { BeanCreateSchema, BeanUpdateSchema } from './bean.ts';
export { VendorCreateSchema, VendorUpdateSchema } from './vendor.ts';
export { BadgeCreateSchema, BadgeUpdateSchema } from './badge.ts';
export { AdminBanUserSchema, AdminModifyRecipeVisibilitySchema, AdminFlushCacheSchema } from './admin.ts';
export { PhotoUploadSchema } from './photo.ts';
export { FollowSchema } from './follow.ts';
export { SearchSchema } from './search.ts';
```

---

### Constants (`packages/shared/src/constants/`)

Add missing constants:

#### `packages/shared/src/constants/brew-method-rules.ts` — NEW FILE

```typescript
import type { BrewMethod, EquipmentType } from '../../types/recipe.ts';

export interface BrewMethodEquipmentRuleDef {
  brewMethod: BrewMethod;
  equipmentType: EquipmentType;
  compatible: boolean;
}

export const BREW_METHOD_EQUIPMENT_RULES: BrewMethodEquipmentRuleDef[] = [
  { brewMethod: 'espresso_machine', equipmentType: 'portafilter', compatible: true },
  { brewMethod: 'espresso_machine', equipmentType: 'basket', compatible: true },
  { brewMethod: 'espresso_machine', equipmentType: 'tamper', compatible: true },
  { brewMethod: 'espresso_machine', equipmentType: 'puck_screen', compatible: true },
  { brewMethod: 'espresso_machine', equipmentType: 'scale', compatible: true },
  { brewMethod: 'espresso_machine', equipmentType: 'paper_filter', compatible: false },
  { brewMethod: 'espresso_machine', equipmentType: 'mesh_filter', compatible: false },
  { brewMethod: 'v60', equipmentType: 'paper_filter', compatible: true },
  { brewMethod: 'v60', equipmentType: 'gooseneck_kettle', compatible: true },
  { brewMethod: 'v60', equipmentType: 'scale', compatible: true },
  { brewMethod: 'v60', equipmentType: 'portafilter', compatible: false },
  { brewMethod: 'v60', equipmentType: 'tamper', compatible: false },
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
];
```

#### `packages/shared/src/constants/index.ts` — UPDATE

```typescript
export { BREW_METHODS } from './brew-methods.ts';
export { DRINK_TYPES } from './drink-types.ts';
export { EMOJI_TAGS } from './emoji-tags.ts';
export { UNIT_CONVERSIONS, CANONICAL_UNITS } from './units.ts';
export { VISIBILITY_STATES } from './visibility.ts';
export { BADGE_RULES } from './badges.ts';
export { BREW_METHOD_EQUIPMENT_RULES } from './brew-method-rules.ts';
```

---

### Utils (`packages/shared/src/utils/`)

Add missing utility functions:

#### `packages/shared/src/utils/slug.ts` — NEW FILE

```typescript
export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

export function ensureUniqueSlug(slug: string, existingSlugs: string[]): string {
  if (!existingSlugs.includes(slug)) return slug;
  let counter = 1;
  let candidate = `${slug}-${counter}`;
  while (existingSlugs.includes(candidate)) {
    counter++;
    candidate = `${slug}-${counter}`;
  }
  return candidate;
}
```

#### `packages/shared/src/utils/index.ts` — UPDATE

```typescript
export {
  convertGramsToOunces,
  convertOuncesToGrams,
  convertMlToFlOz,
  convertFlOzToMl,
  convertCtoF,
  convertFtoC,
  formatWeight,
  formatVolume,
  formatTemperature,
} from './conversion.ts';

export { computeBrewRatio, computeFlowRate } from './metrics.ts';
export { validateGrindDateNotBeforeRoastDate, validateBrewMethodCompatibility, validateSoftWarnings } from './validation.ts';
export { formatDate, isDateBefore } from './date.ts';
export { generateSlug, ensureUniqueSlug } from './slug.ts';
```

---

### i18n (`packages/shared/src/i18n/`)

Add missing i18n keys to `en.json` and `tr.json`:

#### Add to `packages/shared/src/i18n/en.json`:

```json
{
  "auth.resetPasswordSent": "Password reset email sent",
  "auth.resetPasswordSuccess": "Password reset successfully",
  "auth.refreshTokenExpired": "Refresh token expired, please log in again",
  "recipe.compareTitle": "Compare Recipes",
  "recipe.printView": "Print View",
  "recipe.focusMode": "Focus Mode",
  "recipe.qrCode": "QR Code",
  "recipe.share": "Share",
  "recipe.forkedFrom": "Forked from",
  "recipe.versionHistory": "Version History",
  "recipe.newVersion": "New Version",
  "recipe.addEquipment": "Add Equipment",
  "recipe.addTasteNotes": "Add Taste Notes",
  "recipe.addPhotos": "Add Photos",
  "recipe.additionalPreparations": "Additional Preparations",
  "recipe.setupAutofill": "Autofill from Setup",
  "recipe.emojiTag": "Quick Tag",
  "recipe.rating": "Rating",
  "recipe.personalNotes": "Personal Notes",
  "recipe.brewRatio": "Brew Ratio",
  "recipe.flowRate": "Flow Rate",
  "recipe.extractionTime": "Extraction Time",
  "recipe.extractionVolume": "Extraction Volume",
  "recipe.groundWeight": "Ground Weight",
  "recipe.temperature": "Temperature",
  "recipe.grindDate": "Grind Date",
  "recipe.roastDate": "Roast Date",
  "recipe.packageOpenDate": "Package Open Date",
  "recipe.brewDate": "Brew Date",
  "recipe.vendor": "Vendor",
  "recipe.coffeeBrand": "Coffee Brand",
  "recipe.coffeeProcessing": "Coffee Processing",
  "recipe.productName": "Product Name",
  "setup.title": "My Setups",
  "setup.create": "Create Setup",
  "setup.edit": "Edit Setup",
  "setup.delete": "Delete Setup",
  "setup.default": "Default Setup",
  "equipment.title": "Equipment",
  "equipment.create": "Add Equipment",
  "equipment.type": "Equipment Type",
  "bean.title": "My Beans",
  "bean.create": "Add Bean",
  "badge.earned": "Badge Earned!",
  "badge.all": "All Badges",
  "comment.reply": "Reply",
  "comment.op": "OP",
  "follow.follow": "Follow",
  "follow.unfollow": "Unfollow",
  "follow.followers": "Followers",
  "follow.following": "Following",
  "admin.title": "Admin Panel",
  "admin.users": "Users",
  "admin.recipes": "Recipes",
  "admin.tasteNotes": "Taste Notes",
  "admin.equipment": "Equipment",
  "admin.compatibility": "Brew Method Compatibility",
  "admin.badges": "Badge Definitions",
  "admin.auditLog": "Audit Log",
  "admin.flushCache": "Flush Cache",
  "admin.banUser": "Ban User",
  "admin.unbanUser": "Unban User",
  "onboarding.welcome": "Welcome to BrewForm!",
  "onboarding.equipment": "Add Your Equipment",
  "onboarding.beans": "Add Your Beans",
  "onboarding.firstBrew": "Log Your First Brew",
  "onboarding.explore": "Explore Recipes",
  "onboarding.skip": "Skip"
}
```

#### Add corresponding keys to `packages/shared/src/i18n/tr.json`

(Turkish translations for the same keys — follow the same pattern from Phase 1)

---

## Verification Steps

1. Run `deno check packages/shared/src/index.ts` — should type-check all shared code
2. Verify all type exports match Prisma model fields from Phase 2
3. Verify all Zod schemas match the corresponding TypeScript types
4. Verify constant values match Prisma enum values
5. Verify i18n keys cover all UI sections needed by the frontend