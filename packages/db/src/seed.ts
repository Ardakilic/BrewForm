/**
 * @module
 * Re-runnable database seed for BrewForm. Populates reference data (taste notes, brew-method
 * compatibility, badges, equipment + coffee-variety catalogs) plus a baseline admin user, vendors,
 * beans, recipes, and social/setup sample data. Idempotent where supported: inserts use
 * `onConflictDoNothing` on tables with unique constraints and fall back to select-before-insert
 * existence checks for tables without them. Invoked on first container boot (when the users table is
 * empty) and via `make db-seed`.
 */
import { and, eq, ilike, sql } from 'drizzle-orm';
import {
  badges,
  beans,
  brewMethodEnum,
  brewMethodEquipmentRules,
  coffeeVarieties,
  comments,
  equipment,
  equipmentTypeEnum,
  photos,
  recipeAdditionalPreparations,
  recipeEquipment,
  recipes,
  recipeTasteNotes,
  recipeVersionPhotos,
  recipeVersions,
  type RecipeVisibility,
  setups,
  tasteNotes,
  userBadges,
  userFollows,
  userPreferences,
  userRecipeFavourites,
  userRecipeLikes,
  userRecipeRatings,
  users,
  vendors,
} from './schema.ts';
import { db } from './index.ts';
import {
  badgeSeedData,
  beanSeedData,
  brewMethodCompatibilityRules,
  defaultPassword,
  equipmentSeedData,
  hashPassword,
  recipeSeedData,
  setupSeedData,
  socialSeedData,
  userSeedData,
  vendorSeedData,
} from './seed-users-recipes.ts';
import { equipmentCatalogSeedData } from './seed-equipment-catalog.ts';
import { coffeeVarietySeedData } from './seed-coffee-varieties.ts';

type SeedTX = Parameters<Parameters<typeof db.transaction>[0]>[0];

interface ScaaChild {
  name: string;
  colour?: string;
  definition?: string;
  children?: ScaaChild[];
}

interface ScaaRoot {
  name: string;
  colour?: string;
  definition?: string;
  children?: ScaaChild[];
}

interface ScaaFile {
  data: ScaaRoot[];
}

/**
 * Upsert a taste note by its natural key (name + parentId + depth).
 *
 * Returns the existing row if one is found, otherwise the inserted row.
 * The `taste_note` table has no unique constraint on this natural key, so
 * conflicts are detected by selecting first.
 */
async function upsertTasteNote(
  tx: SeedTX,
  values: typeof tasteNotes.$inferInsert,
): Promise<typeof tasteNotes.$inferSelect> {
  const conditions = [
    eq(tasteNotes.name, values.name),
    values.parentId == null
      ? sql`${tasteNotes.parentId} is null`
      : eq(tasteNotes.parentId, values.parentId!),
    eq(tasteNotes.depth, values.depth ?? 0),
  ];
  const [existing] = await tx.select().from(tasteNotes).where(and(...conditions)).limit(1);
  if (existing) return existing;

  const insertValues: typeof tasteNotes.$inferInsert = {
    ...values,
    parentId: values.parentId ?? null,
  };
  const [inserted] = await tx.insert(tasteNotes).values(insertValues).returning();
  return inserted;
}

/**
 * Seed the SCAA taste-note hierarchy idempotently.
 *
 * When a note already exists, the existing row is used as the parent for
 * child notes so the hierarchy stays consistent across repeated runs.
 */
async function seedTasteNotes(tx: SeedTX, data: ScaaRoot[]) {
  for (const root of data) {
    const rootNote = await upsertTasteNote(tx, {
      name: root.name,
      color: root.colour ?? null,
      definition: root.definition ?? null,
      depth: 0,
    });

    if (root.children) {
      for (const child of root.children) {
        const childNote = await upsertTasteNote(tx, {
          name: child.name,
          parentId: rootNote.id,
          color: child.colour ?? null,
          definition: child.definition ?? null,
          depth: 1,
        });

        if (child.children) {
          for (const grandChild of child.children) {
            await upsertTasteNote(tx, {
              name: grandChild.name,
              parentId: childNote.id,
              color: grandChild.colour ?? null,
              definition: grandChild.definition ?? null,
              depth: 2,
            });
          }
        }
      }
    }
  }
}

/**
 * Seed brew-method/equipment-type compatibility rules.
 *
 * Uses `onConflictDoNothing` so the seed can be run repeatedly against a
 * database that already contains the rules (e.g. after a container wipe where
 * the Postgres volume persisted). The unique index on
 * `(brew_method, equipment_type)` guarantees idempotency.
 */
export async function seedBrewMethodCompatibility(tx: SeedTX) {
  for (const rule of brewMethodCompatibilityRules) {
    await tx.insert(brewMethodEquipmentRules).values({
      brewMethod: rule.brewMethod as typeof brewMethodEnum.enumValues[number],
      equipmentType: rule.equipmentType as typeof equipmentTypeEnum.enumValues[number],
      compatible: rule.compatible,
    }).onConflictDoNothing({
      target: [brewMethodEquipmentRules.brewMethod, brewMethodEquipmentRules.equipmentType],
    });
  }
}

/**
 * Seed badges idempotently by their unique `rule` value.
 *
 * Uses `onConflictDoNothing` so the helper can be run repeatedly without
 * violating the `badge_rule_unique` constraint.
 */
async function seedBadges(tx: SeedTX) {
  for (const badge of badgeSeedData) {
    await tx.insert(badges).values(badge).onConflictDoNothing({
      target: badges.rule,
    });
  }
}

/**
 * Seed the admin and seed users idempotently.
 *
 * Uses `onConflictDoNothing` on the unique `email` and `username` columns,
 * then selects the existing user when a conflict occurs so the returned
 * user map is complete even when the database already contains the users.
 * User preferences are also inserted with `onConflictDoNothing` keyed by
 * the unique `userId` column.
 */
async function seedUsers(tx: SeedTX) {
  const adminEmail = Deno.env.get('ADMIN_EMAIL') || 'admin@brewform.local';
  const adminUsername = Deno.env.get('ADMIN_USERNAME') || 'admin';
  const adminPassword = hashPassword(Deno.env.get('ADMIN_PASSWORD') || 'admin123456');

  const [adminInserted] = await tx.insert(users).values({
    email: adminEmail,
    username: adminUsername,
    passwordHash: adminPassword,
    displayName: 'BrewForm Admin',
    isAdmin: true,
    onboardingCompleted: true,
    emailVerifiedAt: new Date(),
  }).onConflictDoNothing({ target: users.email }).returning();

  const admin = adminInserted ??
    (await tx.select().from(users).where(eq(users.email, adminEmail)).limit(1))[0];

  await tx.insert(userPreferences).values({ userId: admin.id }).onConflictDoNothing({
    target: userPreferences.userId,
  });

  const createdUsers: Record<string, typeof users.$inferSelect> = { admin };

  for (const userData of userSeedData) {
    const [userInserted] = await tx.insert(users).values({
      email: userData.email,
      username: userData.username,
      passwordHash: hashPassword(defaultPassword),
      displayName: userData.displayName,
      bio: userData.bio,
      onboardingCompleted: userData.onboardingCompleted,
      emailVerifiedAt: new Date(),
    }).onConflictDoNothing({ target: users.email }).returning();

    const user = userInserted ??
      (await tx.select().from(users).where(eq(users.email, userData.email)).limit(1))[0];

    await tx.insert(userPreferences).values({
      userId: user.id,
      unitSystem: userData.preferences.unitSystem as typeof userPreferences.$inferInsert.unitSystem,
      theme: userData.preferences.theme as typeof userPreferences.$inferInsert.theme,
    }).onConflictDoNothing({ target: userPreferences.userId });

    createdUsers[userData.username] = user;
  }

  return createdUsers;
}

/**
 * Seed vendors idempotently.
 *
 * Returns a map keyed by vendor name. When a vendor already exists, the
 * existing row is selected and included in the map. The `vendor` table has
 * no unique constraint on `name`, so conflicts are detected by selecting
 * the existing row first.
 */
async function seedVendors(tx: SeedTX) {
  const createdVendors: Record<string, typeof vendors.$inferSelect> = {};
  for (const vendorData of vendorSeedData) {
    const [existingByName] = await tx.select().from(vendors).where(
      eq(vendors.name, vendorData.name),
    ).limit(1);
    if (existingByName) {
      createdVendors[vendorData.name] = existingByName;
      continue;
    }
    const [vendor] = await tx.insert(vendors).values(vendorData).returning();
    createdVendors[vendorData.name] = vendor;
  }
  return createdVendors;
}

/**
 * Seed user-created equipment idempotently.
 *
 * Returns a map keyed by equipment name. When a piece of equipment already
 * exists, the existing row is selected and included in the map. The
 * `equipment` table has no unique constraint on `name`, so conflicts are
 * detected by selecting the existing row first.
 */
async function seedEquipment(
  tx: SeedTX,
  createdUsers: Record<string, typeof users.$inferSelect>,
) {
  const createdEquipment: Record<string, typeof equipment.$inferSelect> = {};
  for (const equipData of equipmentSeedData) {
    const [existingByName] = await tx.select().from(equipment).where(
      eq(equipment.name, equipData.name),
    ).limit(1);
    if (existingByName) {
      createdEquipment[equipData.name] = existingByName;
      continue;
    }
    const [equip] = await tx.insert(equipment).values({
      name: equipData.name,
      type: equipData.type as typeof equipmentTypeEnum.enumValues[number],
      brand: equipData.brand,
      description: equipData.description ?? null,
      createdBy: createdUsers[equipData.createdByUsername]?.id,
    }).returning();
    createdEquipment[equipData.name] = equip;
  }
  return createdEquipment;
}

/**
 * Seed the system equipment catalog idempotently.
 *
 * Uses `onConflictDoNothing` on the primary key (`id`) and falls back to
 * selecting the existing row by that stable UUID so the returned map is
 * complete on repeated runs.
 */
async function seedEquipmentCatalog(
  tx: SeedTX,
): Promise<Record<string, typeof equipment.$inferSelect>> {
  const created: Record<string, typeof equipment.$inferSelect> = {};
  for (const equipData of equipmentCatalogSeedData) {
    const [equip] = await tx.insert(equipment).values({
      id: equipData.id,
      name: equipData.name,
      type: equipData.type as typeof equipment.$inferInsert['type'],
      brand: equipData.brand,
      model: equipData.model,
      description: equipData.description,
      isSystem: true,
    }).onConflictDoNothing().returning();
    if (equip) {
      created[equip.name] = equip;
      continue;
    }
    const [existing] = await tx.select().from(equipment).where(
      eq(equipment.id, equipData.id),
    ).limit(1);
    if (existing) created[equipData.name] = existing;
  }
  return created;
}

/**
 * Seed the system coffee variety catalog idempotently.
 *
 * Uses `onConflictDoNothing` on the primary key (`id`) and falls back to
 * selecting the existing row by that stable UUID so the returned map is
 * complete on repeated runs.
 */
async function seedCoffeeVarietiesCatalogue(
  tx: SeedTX,
): Promise<Record<string, typeof coffeeVarieties.$inferSelect>> {
  const created: Record<string, typeof coffeeVarieties.$inferSelect> = {};
  for (const varietyData of coffeeVarietySeedData) {
    const [row] = await tx.insert(coffeeVarieties).values({
      id: varietyData.id,
      name: varietyData.name,
      category: varietyData.category as typeof coffeeVarieties.$inferInsert['category'],
      species: varietyData.species,
      origin: varietyData.origin,
      spread: varietyData.spread,
      altitudeRangeM: varietyData.altitudeRangeM,
      cupProfile: varietyData.cupProfile,
      body: varietyData.body,
      acidity: varietyData.acidity,
      caffeinePct: varietyData.caffeinePct,
      processingCompatibility: varietyData.processingCompatibility,
      diseaseResistance: varietyData.diseaseResistance,
      yield: varietyData.yield,
      plantSize: varietyData.plantSize,
      notes: varietyData.notes,
      subVarieties: varietyData.subVarieties,
      fermentation: varietyData.fermentation,
      dryingTimeDays: varietyData.dryingTimeDays,
      dryingMethod: varietyData.dryingMethod,
      mucilageRetentionPct: varietyData.mucilageRetentionPct,
      priceRange: varietyData.priceRange,
      processing: varietyData.processing,
      typeLabel: varietyData.typeLabel,
      notableFarms: varietyData.notableFarms,
      notableRegions: varietyData.notableRegions,
      regionalVariants: varietyData.regionalVariants,
      globalSharePct: varietyData.globalSharePct,
      isSystem: true,
    }).onConflictDoNothing().returning();
    if (row) {
      created[varietyData.name] = row;
      continue;
    }
    const [existing] = await tx.select().from(coffeeVarieties).where(
      eq(coffeeVarieties.id, varietyData.id),
    ).limit(1);
    if (existing) created[varietyData.name] = existing;
  }
  return created;
}

/**
 * Seed beans idempotently.
 *
 * The `bean` table has no unique constraint, so duplicates are avoided by
 * selecting an existing row matching `(name, userId)` before inserting.
 */
async function seedBeans(
  tx: SeedTX,
  createdUsers: Record<string, typeof users.$inferSelect>,
  createdVendors: Record<string, typeof vendors.$inferSelect>,
) {
  for (const beanData of beanSeedData) {
    const userId = createdUsers[beanData.userUsername]?.id;
    const conditions = [eq(beans.name, beanData.name)];
    if (userId) {
      conditions.push(eq(beans.userId, userId));
    } else {
      conditions.push(sql`${beans.userId} is null`);
    }
    const [existing] = await tx.select().from(beans).where(and(...conditions)).limit(1);
    if (existing) continue;

    await tx.insert(beans).values({
      name: beanData.name,
      brand: beanData.brand,
      vendorId: createdVendors[beanData.vendorName]?.id ?? null,
      roaster: beanData.roaster,
      roastLevel: beanData.roastLevel,
      processing: beanData.processing,
      origin: beanData.origin,
      userId,
    });
  }
}

/**
 * Seed recipes and their first versions idempotently.
 *
 * Recipes are upserted by their unique `slug`. Versions are upserted by
 * `(recipeId, versionNumber)`. On conflict the existing rows are selected
 * and returned so downstream seeders (taste notes, social data) receive
 * valid IDs even when the recipes already exist.
 *
 * Photos are inserted individually because the `photo` table has no unique
 * constraint; an existing photo matching `(recipeId, url)` is reused.
 * Additional preparations are also inserted individually because the table
 * lacks a unique constraint.
 */
async function seedRecipes(
  tx: SeedTX,
  createdUsers: Record<string, typeof users.$inferSelect>,
  createdVendors: Record<string, typeof vendors.$inferSelect>,
  createdEquipment: Record<string, typeof equipment.$inferSelect>,
  createdCoffeeVarieties: Record<string, typeof coffeeVarieties.$inferSelect>,
) {
  const createdRecipes: Record<string, typeof recipes.$inferSelect> = {};
  const createdVersions: Record<string, typeof recipeVersions.$inferSelect> = {};

  for (const recipeData of recipeSeedData) {
    const [recipeInserted] = await tx.insert(recipes).values({
      slug: recipeData.slug,
      title: recipeData.title,
      authorId: createdUsers[recipeData.authorUsername]?.id,
      visibility: recipeData.visibility as RecipeVisibility,
      likeCount: recipeData.likeCount,
      commentCount: recipeData.commentCount,
      forkCount: recipeData.forkCount,
      featured: recipeData.featured,
    }).onConflictDoNothing({ target: recipes.slug }).returning();

    const recipe = recipeInserted ??
      (await tx.select().from(recipes).where(eq(recipes.slug, recipeData.slug)).limit(1))[0];
    if (!recipe) continue;

    const version = recipeData.version;
    const [versionInserted] = await tx.insert(recipeVersions).values({
      recipeId: recipe.id,
      versionNumber: 1,
      productName: version.productName,
      coffeeBrand: version.coffeeBrand,
      coffeeProcessing: version.coffeeProcessing,
      vendorId: createdVendors[version.vendorName]?.id ?? null,
      roastDate: new Date(version.roastDate),
      packageOpenDate: new Date(version.packageOpenDate),
      grindDate: new Date(version.grindDate),
      brewDate: new Date(version.brewDate),
      brewMethod: version.brewMethod as typeof brewMethodEnum.enumValues[number],
      drinkType: version.drinkType as typeof recipeVersions.$inferInsert.drinkType,
      brewerDetails: version.brewerDetails,
      grinder: version.grinder,
      grindSize: version.grindSize,
      groundWeightGrams: version.groundWeightGrams,
      extractionTimeSeconds: version.extractionTimeSeconds,
      extractionVolumeMl: version.extractionVolumeMl,
      temperatureCelsius: version.temperatureCelsius,
      tds: version.tds != null ? String(version.tds) : null,
      brewRatio: version.brewRatio,
      flowRate: version.flowRate,
      preInfusionTimeSeconds:
        (version as { preInfusionTimeSeconds?: number }).preInfusionTimeSeconds ?? null,
      coffeeVarietyId: (recipeData as { coffeeVarietyName?: string }).coffeeVarietyName
        ? createdCoffeeVarieties[(recipeData as { coffeeVarietyName?: string }).coffeeVarietyName!]
          ?.id ?? null
        : null,
      coffeeVarietyName: (recipeData as { coffeeVarietyName?: string }).coffeeVarietyName ?? null,
      personalNotes: version.personalNotes,
      preparationNotes: version.preparationNotes,
      isFavourite: version.isFavourite,
      rating: version.rating,
      emojiTag: version.emojiTag as typeof recipeVersions.$inferInsert.emojiTag,
    }).onConflictDoNothing({
      target: [recipeVersions.recipeId, recipeVersions.versionNumber],
    }).returning();

    let recipeVersion = versionInserted ?? null;
    if (!recipeVersion) {
      const [existing] = await tx.select().from(recipeVersions).where(
        and(
          eq(recipeVersions.recipeId, recipe.id),
          eq(recipeVersions.versionNumber, 1),
        ),
      ).limit(1);
      recipeVersion = existing ?? null;
    }
    if (!recipeVersion) continue;

    await tx.update(recipes).set({ currentVersionId: recipeVersion.id }).where(
      eq(recipes.id, recipe.id),
    );

    // Equipment associations
    const equipAssociations = recipeData.equipmentNames
      .map((name) => {
        const equip = createdEquipment[name];
        if (!equip) return null;
        return { recipeVersionId: recipeVersion.id, equipmentId: equip.id };
      })
      .filter(Boolean);

    if (equipAssociations.length > 0) {
      await tx.insert(recipeEquipment).values(
        equipAssociations as typeof recipeEquipment.$inferInsert[],
      ).onConflictDoNothing({
        target: [recipeEquipment.recipeVersionId, recipeEquipment.equipmentId],
      });
    }

    // Additional preparations
    if (recipeData.additionalPreparations) {
      for (const prep of recipeData.additionalPreparations) {
        const [existingPrep] = await tx.select().from(recipeAdditionalPreparations).where(
          and(
            eq(recipeAdditionalPreparations.recipeVersionId, recipeVersion.id),
            eq(recipeAdditionalPreparations.name, prep.name),
            eq(
              recipeAdditionalPreparations.type,
              prep.type as typeof recipeAdditionalPreparations.$inferInsert.type,
            ),
          ),
        ).limit(1);
        if (existingPrep) continue;

        await tx.insert(recipeAdditionalPreparations).values({
          recipeVersionId: recipeVersion.id,
          name: prep.name,
          type: prep.type as typeof recipeAdditionalPreparations.$inferInsert.type,
          inputAmount: prep.inputAmount,
          preparationType: prep.preparationType,
          sortOrder: prep.sortOrder,
        });
      }
    }

    // Photos
    if (recipeData.photos) {
      for (const photoData of recipeData.photos) {
        const [existingPhoto] = await tx.select().from(photos).where(
          and(
            eq(photos.recipeId, recipe.id),
            eq(photos.url, photoData.url),
          ),
        ).limit(1);

        const photo = existingPhoto ??
          (await tx.insert(photos).values({
            recipeId: recipe.id,
            url: photoData.url,
            alt: photoData.alt ?? null,
            sortOrder: photoData.sortOrder,
          }).returning())[0];
        if (!photo) continue;

        await tx.insert(recipeVersionPhotos).values({
          recipeVersionId: recipeVersion.id,
          photoId: photo.id,
          sortOrder: photoData.sortOrder,
        }).onConflictDoNothing({
          target: [recipeVersionPhotos.recipeVersionId, recipeVersionPhotos.photoId],
        });
      }
    }

    createdRecipes[recipeData.slug] = recipe;
    createdVersions[recipeData.slug] = recipeVersion;
  }

  return { createdRecipes, createdVersions };
}

/**
 * Seed recipe taste-note associations idempotently.
 *
 * Looks up each taste note by name, then inserts into `recipeTasteNotes`
 * with `onConflictDoNothing` on `(recipeVersionId, tasteNoteId)`.
 */
async function seedRecipeTasteNotes(
  tx: SeedTX,
  createdVersions: Record<string, typeof recipeVersions.$inferSelect>,
) {
  for (const recipeData of recipeSeedData) {
    const recipeVersion = createdVersions[recipeData.slug];
    if (!recipeVersion || !recipeData.tasteNotes) continue;

    const notesToInsert: typeof recipeTasteNotes.$inferInsert[] = [];
    for (const note of recipeData.tasteNotes) {
      const [found] = await tx.select().from(tasteNotes).where(
        ilike(tasteNotes.name, note.name),
      ).limit(1);
      if (found) {
        notesToInsert.push({
          recipeVersionId: recipeVersion.id,
          tasteNoteId: found.id,
          intensity: note.intensity,
        });
      }
    }

    if (notesToInsert.length > 0) {
      await tx.insert(recipeTasteNotes).values(notesToInsert).onConflictDoNothing({
        target: [recipeTasteNotes.recipeVersionId, recipeTasteNotes.tasteNoteId],
      });
    }
  }
}

/**
 * Seed social data (follows, likes, favourites, ratings, comments, badges)
 * idempotently.
 *
 * All junction/association tables are inserted with `onConflictDoNothing`
 * on their unique composite keys. Comments do not have a natural unique
 * key, so replies are inserted without deduplication (consistent with the
 * original seed behaviour).
 */
async function seedSocialData(
  tx: SeedTX,
  createdUsers: Record<string, typeof users.$inferSelect>,
  createdRecipes: Record<string, typeof recipes.$inferSelect>,
) {
  // Follows
  for (const follow of socialSeedData.follows) {
    await tx.insert(userFollows).values({
      followerId: createdUsers[follow.followerUsername]?.id,
      followingId: createdUsers[follow.followingUsername]?.id,
    }).onConflictDoNothing({
      target: [userFollows.followerId, userFollows.followingId],
    });
  }

  // Likes
  for (const like of socialSeedData.likes) {
    await tx.insert(userRecipeLikes).values({
      userId: createdUsers[like.userUsername]?.id,
      recipeId: createdRecipes[like.recipeSlug]?.id,
    }).onConflictDoNothing({
      target: [userRecipeLikes.userId, userRecipeLikes.recipeId],
    });
  }

  // Favourites
  for (const fav of socialSeedData.favourites) {
    await tx.insert(userRecipeFavourites).values({
      userId: createdUsers[fav.userUsername]?.id,
      recipeId: createdRecipes[fav.recipeSlug]?.id,
    }).onConflictDoNothing({
      target: [userRecipeFavourites.userId, userRecipeFavourites.recipeId],
    });
  }

  // Ratings
  for (const rating of socialSeedData.ratings) {
    await tx.insert(userRecipeRatings).values({
      userId: createdUsers[rating.userUsername]?.id,
      recipeId: createdRecipes[rating.recipeSlug]?.id,
      rating: rating.rating,
    }).onConflictDoNothing({
      target: [userRecipeRatings.userId, userRecipeRatings.recipeId],
    });
  }

  // Comments
  for (const comment of socialSeedData.comments) {
    const recipeId = createdRecipes[comment.recipeSlug]?.id;
    const authorId = createdUsers[comment.authorUsername]?.id;

    const [existingParent] = await tx.select().from(comments).where(
      and(
        eq(comments.recipeId, recipeId),
        eq(comments.authorId, authorId),
        eq(comments.content, comment.content),
        sql`${comments.parentCommentId} is null`,
      ),
    ).limit(1);

    const parentComment = existingParent ??
      (await tx.insert(comments).values({
        recipeId,
        authorId,
        content: comment.content,
      }).returning())[0];
    if (!parentComment) continue;

    for (const reply of comment.replies) {
      const replyAuthorId = createdUsers[reply.authorUsername]?.id;
      const [existingReply] = await tx.select().from(comments).where(
        and(
          eq(comments.recipeId, recipeId),
          eq(comments.authorId, replyAuthorId),
          eq(comments.content, reply.content),
          eq(comments.parentCommentId, parentComment.id),
        ),
      ).limit(1);
      if (existingReply) continue;

      await tx.insert(comments).values({
        recipeId,
        authorId: replyAuthorId,
        content: reply.content,
        parentCommentId: parentComment.id,
      });
    }
  }

  // Badges
  for (const badge of socialSeedData.badges) {
    const badgeRows = await tx.select().from(badges).where(
      eq(badges.rule, badge.badgeRule as typeof badges.$inferInsert.rule),
    ).limit(1);
    if (badgeRows.length > 0) {
      await tx.insert(userBadges).values({
        userId: createdUsers[badge.userUsername]?.id,
        badgeId: badgeRows[0].id,
      }).onConflictDoNothing({
        target: [userBadges.userId, userBadges.badgeId],
      });
    }
  }
}

/**
 * Seed user setups idempotently.
 *
 * The `setup` table has no unique constraint on `(userId, name)`, so
 * duplicates are avoided by selecting an existing matching row before
 * inserting.
 */
async function seedSetups(
  tx: SeedTX,
  createdUsers: Record<string, typeof users.$inferSelect>,
  createdEquipment: Record<string, typeof equipment.$inferSelect>,
) {
  for (const setupData of setupSeedData) {
    const userId = createdUsers[setupData.userUsername]?.id;
    const [existing] = await tx.select().from(setups).where(
      and(
        eq(setups.userId, userId),
        eq(setups.name, setupData.name),
      ),
    ).limit(1);
    if (existing) continue;

    const equipMap: Record<string, string | undefined> = {};
    for (const name of setupData.equipmentNames) {
      const equip = createdEquipment[name];
      if (!equip) continue;
      equipMap[`${equip.type}Id`] = equip.id;
    }

    await tx.insert(setups).values({
      name: setupData.name,
      userId,
      brewerDetails: setupData.brewerDetails,
      grinder: setupData.grinder,
      portafilterId: equipMap.portafilterId ?? null,
      basketId: equipMap.basketId ?? null,
      puckScreenId: equipMap.puck_screenId ?? null,
      paperFilterId: equipMap.paper_filterId ?? null,
      tamperId: equipMap.tamperId ?? null,
      isDefault: setupData.isDefault,
    });
  }
}

/**
 * Run the complete seed inside a database transaction.
 *
 * Every helper is idempotent, so calling this function repeatedly is safe
 * even when the database already contains seed data.
 */
export async function main() {
  const adminEmail = Deno.env.get('ADMIN_EMAIL') || 'admin@brewform.local';
  const adminPassword = Deno.env.get('ADMIN_PASSWORD') || 'admin123456';
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Admin: ${adminEmail} / ${adminPassword}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Seeding database...');

  const scaaPath = new URL('../../../files/scaa-2.json', import.meta.url);
  const scaaData: ScaaFile = JSON.parse(await Deno.readTextFile(scaaPath));

  await db.transaction(async (tx) => {
    await seedBrewMethodCompatibility(tx);
    await seedBadges(tx);

    const createdUsers = await seedUsers(tx);
    const createdEquipmentCatalog = await seedEquipmentCatalog(tx);
    const createdCoffeeVarieties = await seedCoffeeVarietiesCatalogue(tx);
    const createdVendors = await seedVendors(tx);
    const createdEquipment = await seedEquipment(tx, createdUsers);

    await seedBeans(tx, createdUsers, createdVendors);

    const { createdRecipes, createdVersions } = await seedRecipes(
      tx,
      createdUsers,
      createdVendors,
      { ...createdEquipmentCatalog, ...createdEquipment },
      createdCoffeeVarieties,
    );

    await seedSocialData(tx, createdUsers, createdRecipes);
    await seedSetups(tx, createdUsers, createdEquipment);
    await seedTasteNotes(tx, scaaData.data);
    await seedRecipeTasteNotes(tx, createdVersions);
  });

  console.log('Seeding complete!');
  console.log(`Admin credentials: ${adminEmail} / ${adminPassword}`);
}

if (import.meta.main) {
  main()
    .catch((e) => {
      console.error(e);
      Deno.exit(1);
    })
    .finally(async () => {
      const { client } = await import('@brewform/db');
      await client.end();
    });
}
