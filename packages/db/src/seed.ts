import { eq, ilike } from 'drizzle-orm';
import {
  badges,
  beans,
  brewMethodEquipmentRules,
  coffeeVarieties,
  comments,
  equipment,
  photos,
  recipeAdditionalPreparations,
  recipeEquipment,
  recipes,
  recipeTasteNotes,
  recipeVersionPhotos,
  recipeVersions,
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

async function seedTasteNotes(tx: any, data: ScaaRoot[]) {
  for (const root of data) {
    const [rootNote] = await tx.insert(tasteNotes).values({
      name: root.name,
      color: root.colour ?? null,
      definition: root.definition ?? null,
      depth: 0,
    }).returning();

    if (root.children) {
      for (const child of root.children) {
        const [childNote] = await tx.insert(tasteNotes).values({
          name: child.name,
          parentId: rootNote.id,
          color: child.colour ?? null,
          definition: child.definition ?? null,
          depth: 1,
        }).returning();

        if (child.children) {
          for (const grandChild of child.children) {
            await tx.insert(tasteNotes).values({
              name: grandChild.name,
              parentId: childNote.id,
              color: (grandChild as any).colour ?? null,
              definition: (grandChild as any).definition ?? null,
              depth: 2,
            });
          }
        }
      }
    }
  }
}

async function seedBrewMethodCompatibility(tx: any) {
  for (const rule of brewMethodCompatibilityRules) {
    await tx.insert(brewMethodEquipmentRules).values({
      brewMethod: rule.brewMethod as any,
      equipmentType: rule.equipmentType as any,
      compatible: rule.compatible,
    });
  }
}

async function seedBadges(tx: any) {
  for (const badge of badgeSeedData) {
    await tx.insert(badges).values(badge);
  }
}

async function seedUsers(tx: any) {
  const adminEmail = Deno.env.get('ADMIN_EMAIL') || 'admin@brewform.local';
  const adminUsername = Deno.env.get('ADMIN_USERNAME') || 'admin';
  const adminPassword = hashPassword(Deno.env.get('ADMIN_PASSWORD') || 'admin123456');

  const [admin] = await tx.insert(users).values({
    email: adminEmail,
    username: adminUsername,
    passwordHash: adminPassword,
    displayName: 'BrewForm Admin',
    isAdmin: true,
    onboardingCompleted: true,
    emailVerifiedAt: new Date(),
  }).returning();

  await tx.insert(userPreferences).values({ userId: admin.id });

  const createdUsers: Record<string, any> = { admin };

  for (const userData of userSeedData) {
    const [user] = await tx.insert(users).values({
      email: userData.email,
      username: userData.username,
      passwordHash: hashPassword(defaultPassword),
      displayName: userData.displayName,
      bio: userData.bio,
      onboardingCompleted: userData.onboardingCompleted,
      emailVerifiedAt: new Date(),
    }).returning();

    await tx.insert(userPreferences).values({
      userId: user.id,
      unitSystem: userData.preferences.unitSystem as any,
      theme: userData.preferences.theme as any,
    });

    createdUsers[userData.username] = user;
  }

  return createdUsers;
}

async function seedVendors(tx: any) {
  const createdVendors: Record<string, any> = {};
  for (const vendorData of vendorSeedData) {
    const [vendor] = await tx.insert(vendors).values(vendorData).returning();
    createdVendors[vendorData.name] = vendor;
  }
  return createdVendors;
}

async function seedEquipment(tx: any, createdUsers: Record<string, any>) {
  const createdEquipment: Record<string, any> = {};
  for (const equipData of equipmentSeedData) {
    const [equip] = await tx.insert(equipment).values({
      name: equipData.name,
      type: equipData.type as any,
      brand: equipData.brand,
      description: equipData.description ?? null,
      createdBy: createdUsers[equipData.createdByUsername]?.id,
    }).returning();
    createdEquipment[equipData.name] = equip;
  }
  return createdEquipment;
}

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
    if (equip) created[equip.name] = equip;
  }
  return created;
}

async function seedCoffeeVarietiesCatalogue(
  tx: SeedTX,
): Promise<Record<string, typeof coffeeVarieties.$inferSelect>> {
  const created: Record<string, typeof coffeeVarieties.$inferSelect> = {};
  for (const varietyData of coffeeVarietySeedData) {
    const [row] = await tx.insert(coffeeVarieties).values({
      id: varietyData.id, name: varietyData.name,
      category: varietyData.category as typeof coffeeVarieties.$inferInsert['category'],
      species: varietyData.species, origin: varietyData.origin,
      spread: varietyData.spread, altitudeRangeM: varietyData.altitudeRangeM,
      cupProfile: varietyData.cupProfile, body: varietyData.body,
      acidity: varietyData.acidity, caffeinePct: varietyData.caffeinePct,
      processingCompatibility: varietyData.processingCompatibility,
      diseaseResistance: varietyData.diseaseResistance,
      yield: varietyData.yield, plantSize: varietyData.plantSize,
      notes: varietyData.notes, subVarieties: varietyData.subVarieties,
      fermentation: varietyData.fermentation, dryingTimeDays: varietyData.dryingTimeDays,
      dryingMethod: varietyData.dryingMethod, mucilageRetentionPct: varietyData.mucilageRetentionPct,
      priceRange: varietyData.priceRange, processing: varietyData.processing,
      typeLabel: varietyData.typeLabel, notableFarms: varietyData.notableFarms,
      notableRegions: varietyData.notableRegions, regionalVariants: varietyData.regionalVariants,
      globalSharePct: varietyData.globalSharePct, isSystem: true,
    }).onConflictDoNothing().returning();
    if (row) created[varietyData.name] = row;
  }
  return created;
}

async function seedBeans(
  tx: any,
  createdUsers: Record<string, any>,
  createdVendors: Record<string, any>,
) {
  for (const beanData of beanSeedData) {
    await tx.insert(beans).values({
      name: beanData.name,
      brand: beanData.brand,
      vendorId: createdVendors[beanData.vendorName]?.id ?? null,
      roaster: beanData.roaster,
      roastLevel: beanData.roastLevel,
      processing: beanData.processing,
      origin: beanData.origin,
      userId: createdUsers[beanData.userUsername]?.id,
    });
  }
}

async function seedRecipes(
  tx: any,
  createdUsers: Record<string, any>,
  createdVendors: Record<string, any>,
  createdEquipment: Record<string, any>,
  createdCoffeeVarieties: Record<string, any>,
) {
  const createdRecipes: Record<string, any> = {};
  const createdVersions: Record<string, any> = {};

  for (const recipeData of recipeSeedData) {
    const [recipe] = await tx.insert(recipes).values({
      slug: recipeData.slug,
      title: recipeData.title,
      authorId: createdUsers[recipeData.authorUsername]?.id,
      visibility: recipeData.visibility as any,
      likeCount: recipeData.likeCount,
      commentCount: recipeData.commentCount,
      forkCount: recipeData.forkCount,
      featured: recipeData.featured,
    }).returning();

    const version = recipeData.version;
    const [recipeVersion] = await tx.insert(recipeVersions).values({
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
      brewMethod: version.brewMethod as any,
      drinkType: version.drinkType as any,
      brewerDetails: version.brewerDetails,
      grinder: version.grinder,
      grindSize: version.grindSize,
      groundWeightGrams: version.groundWeightGrams,
      extractionTimeSeconds: version.extractionTimeSeconds,
      extractionVolumeMl: version.extractionVolumeMl,
      temperatureCelsius: version.temperatureCelsius,
      tds: version.tds,
      brewRatio: version.brewRatio,
      flowRate: version.flowRate,
      preInfusionTimeSeconds: (version as any).preInfusionTimeSeconds ?? null,
      coffeeVarietyId: (recipeData as any).coffeeVarietyName
        ? createdCoffeeVarieties[(recipeData as any).coffeeVarietyName]?.id ?? null
        : null,
      coffeeVarietyName: (recipeData as any).coffeeVarietyName ?? null,
      personalNotes: version.personalNotes,
      preparationNotes: version.preparationNotes,
      isFavourite: version.isFavourite,
      rating: version.rating,
      emojiTag: version.emojiTag as any,
    }).returning();

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
      await tx.insert(recipeEquipment).values(equipAssociations as any[]);
    }

    // Additional preparations
    if (recipeData.additionalPreparations) {
      const prepValues = recipeData.additionalPreparations.map((prep) => ({
        recipeVersionId: recipeVersion.id,
        name: prep.name,
        type: prep.type as any,
        inputAmount: prep.inputAmount,
        preparationType: prep.preparationType,
        sortOrder: prep.sortOrder,
      }));
      await tx.insert(recipeAdditionalPreparations).values(prepValues);
    }

    // Photos
    if (recipeData.photos) {
      for (const photoData of recipeData.photos) {
        const [photo] = await tx.insert(photos).values({
          recipeId: recipe.id,
          url: photoData.url,
          alt: photoData.alt ?? null,
          sortOrder: photoData.sortOrder,
        }).returning();

        await tx.insert(recipeVersionPhotos).values({
          recipeVersionId: recipeVersion.id,
          photoId: photo.id,
          sortOrder: photoData.sortOrder,
        });
      }
    }

    createdRecipes[recipeData.slug] = recipe;
    createdVersions[recipeData.slug] = recipeVersion;
  }

  return { createdRecipes, createdVersions };
}

async function seedRecipeTasteNotes(
  tx: any,
  createdVersions: Record<string, any>,
) {
  for (const recipeData of recipeSeedData) {
    const recipeVersion = createdVersions[recipeData.slug];
    if (!recipeVersion || !recipeData.tasteNotes) continue;

    const notesToInsert: any[] = [];
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
      await tx.insert(recipeTasteNotes).values(notesToInsert);
    }
  }
}

async function seedSocialData(
  tx: any,
  createdUsers: Record<string, any>,
  createdRecipes: Record<string, any>,
) {
  // Follows
  for (const follow of socialSeedData.follows) {
    await tx.insert(userFollows).values({
      followerId: createdUsers[follow.followerUsername]?.id,
      followingId: createdUsers[follow.followingUsername]?.id,
    });
  }

  // Likes
  for (const like of socialSeedData.likes) {
    await tx.insert(userRecipeLikes).values({
      userId: createdUsers[like.userUsername]?.id,
      recipeId: createdRecipes[like.recipeSlug]?.id,
    });
  }

  // Favourites
  for (const fav of socialSeedData.favourites) {
    await tx.insert(userRecipeFavourites).values({
      userId: createdUsers[fav.userUsername]?.id,
      recipeId: createdRecipes[fav.recipeSlug]?.id,
    });
  }

  // Ratings
  for (const rating of socialSeedData.ratings) {
    await tx.insert(userRecipeRatings).values({
      userId: createdUsers[rating.userUsername]?.id,
      recipeId: createdRecipes[rating.recipeSlug]?.id,
      rating: rating.rating,
    });
  }

  // Comments
  for (const comment of socialSeedData.comments) {
    const [parentComment] = await tx.insert(comments).values({
      recipeId: createdRecipes[comment.recipeSlug]?.id,
      authorId: createdUsers[comment.authorUsername]?.id,
      content: comment.content,
    }).returning();

    for (const reply of comment.replies) {
      await tx.insert(comments).values({
        recipeId: createdRecipes[comment.recipeSlug]?.id,
        authorId: createdUsers[reply.authorUsername]?.id,
        content: reply.content,
        parentCommentId: parentComment.id,
      });
    }
  }

  // Badges
  for (const badge of socialSeedData.badges) {
    const badgeRows = await tx.select().from(badges).where(eq(badges.rule, badge.badgeRule as any))
      .limit(1);
    if (badgeRows.length > 0) {
      await tx.insert(userBadges).values({
        userId: createdUsers[badge.userUsername]?.id,
        badgeId: badgeRows[0].id,
      });
    }
  }
}

async function seedSetups(
  tx: any,
  createdUsers: Record<string, any>,
  createdEquipment: Record<string, any>,
) {
  for (const setupData of setupSeedData) {
    const equipMap: Record<string, string | undefined> = {};
    for (const name of setupData.equipmentNames) {
      const equip = createdEquipment[name];
      if (!equip) continue;
      equipMap[`${equip.type}Id`] = equip.id;
    }

    await tx.insert(setups).values({
      name: setupData.name,
      userId: createdUsers[setupData.userUsername]?.id,
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

async function main() {
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
      tx, createdUsers, createdVendors,
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

main()
  .catch((e) => {
    console.error(e);
    Deno.exit(1);
  })
  .finally(async () => {
    const { client } = await import('@brewform/db');
    await client.end();
  });
