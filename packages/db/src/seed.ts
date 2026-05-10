import { db } from '@brewform/db';
import { eq, ilike } from 'drizzle-orm';
import * as bcryptjs from 'bcryptjs';
import {
  badges,
  beans,
  brewMethodEquipmentRules,
  comments,
  equipment,
  recipeEquipment,
  recipeTasteNotes,
  recipes,
  recipeVersions,
  setups,
  tasteNotes,
  userBadges,
  userFollows,
  userPreferences,
  userRecipeFavourites,
  userRecipeLikes,
  users,
  vendors,
} from './schema.ts';

const hashSync = (bcryptjs as any).hashSync || (bcryptjs as any).default?.hashSync;

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

async function seedTasteNotes(tx: typeof db, data: ScaaRoot[]) {
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

async function seedBrewMethodCompatibility(tx: typeof db) {
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
    await tx.insert(brewMethodEquipmentRules).values({
      brewMethod: rule.brewMethod as any,
      equipmentType: rule.equipmentType as any,
      compatible: rule.compatible,
    });
  }
}

async function seedBadges(tx: typeof db) {
  const badgeData = [
    {
      name: 'First Brew',
      icon: 'coffee',
      rule: 'first_brew' as const,
      description: 'Logged your first recipe',
      threshold: 1,
    },
    {
      name: 'Decade Brewer',
      icon: 'ten',
      rule: 'decade_brewer' as const,
      description: '10 recipes logged',
      threshold: 10,
    },
    {
      name: 'Centurion',
      icon: '100',
      rule: 'centurion' as const,
      description: '100 recipes logged',
      threshold: 100,
    },
    {
      name: 'First Fork',
      icon: 'fork_and_knife',
      rule: 'first_fork' as const,
      description: 'Forked your first recipe',
      threshold: 1,
    },
    {
      name: 'Fan Favourite',
      icon: 'star',
      rule: 'fan_favourite' as const,
      description: 'One of your recipes received 10+ likes',
      threshold: 10,
    },
    {
      name: 'Community Star',
      icon: 'star2',
      rule: 'community_star' as const,
      description: 'One of your recipes received 50+ likes',
      threshold: 50,
    },
    {
      name: 'Conversationalist',
      icon: 'speech_balloon',
      rule: 'conversationalist' as const,
      description: 'Left 10+ comments',
      threshold: 10,
    },
    {
      name: 'Precision Brewer',
      icon: 'dart',
      rule: 'precision_brewer' as const,
      description: 'Logged 10 recipes with all optional fields filled',
      threshold: 10,
    },
    {
      name: 'Explorer',
      icon: 'globe',
      rule: 'explorer' as const,
      description: 'Brewed with 5+ different brew methods',
      threshold: 5,
    },
    {
      name: 'Influencer',
      icon: 'busts_in_silhouette',
      rule: 'influencer' as const,
      description: 'Gained 25+ followers',
      threshold: 25,
    },
  ];

  for (const badge of badgeData) {
    await tx.insert(badges).values(badge);
  }
}

async function seedUsers(tx: typeof db) {
  const adminEmail = Deno.env.get('ADMIN_EMAIL') || 'admin@brewform.local';
  const adminUsername = Deno.env.get('ADMIN_USERNAME') || 'admin';
  const adminPassword = hashSync(Deno.env.get('ADMIN_PASSWORD') || 'admin123456', 10);
  const user1Password = hashSync('user123456', 10);
  const user2Password = hashSync('user123456', 10);

  const [admin] = await tx.insert(users).values({
    email: adminEmail,
    username: adminUsername,
    passwordHash: adminPassword,
    displayName: 'BrewForm Admin',
    isAdmin: true,
    onboardingCompleted: true,
  }).returning();

  await tx.insert(userPreferences).values({ userId: admin.id });

  const [user1] = await tx.insert(users).values({
    email: 'alice@example.com',
    username: 'alice',
    passwordHash: user1Password,
    displayName: 'Alice Brewer',
    bio: 'Espresso enthusiast from Portland',
    onboardingCompleted: true,
  }).returning();

  await tx.insert(userPreferences).values({
    userId: user1.id,
    unitSystem: 'metric',
    theme: 'coffee',
  });

  const [user2] = await tx.insert(users).values({
    email: 'bob@example.com',
    username: 'bob',
    passwordHash: user2Password,
    displayName: 'Bob Barista',
    bio: 'V60 lover and specialty coffee nerd',
    onboardingCompleted: true,
  }).returning();

  await tx.insert(userPreferences).values({
    userId: user2.id,
    unitSystem: 'metric',
    theme: 'dark',
  });

  return { admin, user1, user2 };
}

async function seedRecipes(tx: typeof db, seedUsers: { admin: any; user1: any; user2: any }) {
  const [portafilter] = await tx.insert(equipment).values({
    name: 'Bottomless Portafilter 58mm',
    type: 'portafilter',
    brand: 'Lelit',
    createdBy: seedUsers.user1.id,
  }).returning();

  const [basket] = await tx.insert(equipment).values({
    name: 'IMS H24 18g',
    type: 'basket',
    brand: 'IMS',
    createdBy: seedUsers.user1.id,
  }).returning();

  const [tamper] = await tx.insert(equipment).values({
    name: 'Normcore 58.5mm Spring Tamper',
    type: 'tamper',
    brand: 'Normcore',
    createdBy: seedUsers.user1.id,
  }).returning();

  const [puckScreen] = await tx.insert(equipment).values({
    name: 'Metal Puck Screen 58.5mm',
    type: 'puck_screen',
    brand: 'Sieve',
    createdBy: seedUsers.user1.id,
  }).returning();

  const [gooseneck] = await tx.insert(equipment).values({
    name: 'Fellow Stagg EKG',
    type: 'gooseneck_kettle',
    brand: 'Fellow',
    createdBy: seedUsers.user2.id,
  }).returning();

  const [v60Filter] = await tx.insert(equipment).values({
    name: 'Hario V60 Paper Filter 02',
    type: 'paper_filter',
    brand: 'Hario',
    createdBy: seedUsers.user2.id,
  }).returning();

  const [scale] = await tx.insert(equipment).values({
    name: 'Acaia Lunar',
    type: 'scale',
    brand: 'Acaia',
    description: 'High-precision espresso scale',
    createdBy: seedUsers.user1.id,
  }).returning();

  const [vendor1] = await tx.insert(vendors).values({
    name: 'Heart Coffee Roasters',
    website: 'https://heartroasters.com',
    description: 'Portland-based specialty coffee roaster',
  }).returning();

  await tx.insert(beans).values({
    name: 'Heart Ethiopia Yirgacheffe',
    brand: 'Heart',
    vendorId: vendor1.id,
    roaster: 'Heart Coffee Roasters',
    roastLevel: 'light',
    processing: 'washed',
    origin: 'Ethiopia, Yirgacheffe',
    userId: seedUsers.user1.id,
  });

  const [recipe1] = await tx.insert(recipes).values({
    slug: 'alices-signature-espresso',
    title: "Alice's Signature Espresso",
    authorId: seedUsers.user1.id,
    visibility: 'public',
    likeCount: 5,
    commentCount: 2,
    forkCount: 1,
    featured: true,
  }).returning();

  const [recipe1Version] = await tx.insert(recipeVersions).values({
    recipeId: recipe1.id,
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
    preInfusionTimeSeconds: 5,
    extractionVolumeMl: 36,
    temperatureCelsius: 93,
    brewRatio: 2.0,
    flowRate: 1.29,
    personalNotes: 'Beautiful sweet shot with floral notes and a honey finish.',
    isFavourite: true,
    rating: 9,
    emojiTag: 'fire',
  }).returning();

  await tx.update(recipes).set({ currentVersionId: recipe1Version.id }).where(
    eq(recipes.id, recipe1.id),
  );

  await tx.insert(recipeEquipment).values([
    { recipeVersionId: recipe1Version.id, equipmentId: portafilter.id },
    { recipeVersionId: recipe1Version.id, equipmentId: basket.id },
    { recipeVersionId: recipe1Version.id, equipmentId: tamper.id },
    { recipeVersionId: recipe1Version.id, equipmentId: puckScreen.id },
    { recipeVersionId: recipe1Version.id, equipmentId: scale.id },
  ]);

  const [recipe2] = await tx.insert(recipes).values({
    slug: 'bobs-morning-v60',
    title: "Bob's Morning V60",
    authorId: seedUsers.user2.id,
    visibility: 'public',
    likeCount: 3,
    featured: false,
  }).returning();

  const [recipe2Version] = await tx.insert(recipeVersions).values({
    recipeId: recipe2.id,
    versionNumber: 1,
    productName: 'Heart Ethiopia Yirgacheffe',
    coffeeBrand: 'Heart',
    coffeeProcessing: 'washed',
    vendorId: vendor1.id,
    roastDate: new Date('2026-03-15'),
    packageOpenDate: new Date('2026-03-22'),
    grindDate: new Date('2026-04-12'),
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
  }).returning();

  await tx.update(recipes).set({ currentVersionId: recipe2Version.id }).where(
    eq(recipes.id, recipe2.id),
  );

  await tx.insert(recipeEquipment).values([
    { recipeVersionId: recipe2Version.id, equipmentId: gooseneck.id },
    { recipeVersionId: recipe2Version.id, equipmentId: v60Filter.id },
  ]);

  return { recipe1, recipe2, portafilter, basket, tamper, puckScreen, gooseneck, v60Filter, scale };
}

async function seedSocialData(
  tx: typeof db,
  seedUsers: { admin: any; user1: any; user2: any },
  seedRecipes: { recipe1: any; recipe2: any },
) {
  await tx.insert(userFollows).values({
    followerId: seedUsers.user2.id,
    followingId: seedUsers.user1.id,
  });

  await tx.insert(userRecipeLikes).values({
    userId: seedUsers.user2.id,
    recipeId: seedRecipes.recipe1.id,
  });

  await tx.insert(userRecipeFavourites).values({
    userId: seedUsers.user2.id,
    recipeId: seedRecipes.recipe1.id,
  });

  const [comment1] = await tx.insert(comments).values({
    recipeId: seedRecipes.recipe1.id,
    authorId: seedUsers.user2.id,
    content: 'Amazing shot! What Grinder setting are you using?',
  }).returning();

  await tx.insert(comments).values({
    recipeId: seedRecipes.recipe1.id,
    authorId: seedUsers.user1.id,
    content: 'Thanks! Setting 12 on the Lelit Fred.',
    parentCommentId: comment1.id,
  });

  const firstBrewBadge = await tx.select().from(badges).where(eq(badges.rule, 'first_brew')).limit(
    1,
  );
  if (firstBrewBadge.length > 0) {
    await tx.insert(userBadges).values({
      userId: seedUsers.user1.id,
      badgeId: firstBrewBadge[0].id,
    });
  }
}

async function seedSetups(
  tx: typeof db,
  seedUsers: { admin: any; user1: any; user2: any },
  seedEquipment: any,
) {
  await tx.insert(setups).values({
    name: "Alice's Espresso Setup",
    userId: seedUsers.user1.id,
    brewerDetails: 'Lelit Mara X',
    grinder: 'Lelit Fred',
    portafilterId: seedEquipment.portafilter.id,
    basketId: seedEquipment.basket.id,
    puckScreenId: seedEquipment.puckScreen.id,
    tamperId: seedEquipment.tamper.id,
    isDefault: true,
  });

  await tx.insert(setups).values({
    name: "Bob's V60 Setup",
    userId: seedUsers.user2.id,
    brewerDetails: 'Hario V60 02',
    grinder: 'Baratza Encore',
    isDefault: true,
  });
}

async function seedRecipeTasteNotes(tx: typeof db, recipeVersionId: string) {
  // Query for specific taste note IDs by name (case-insensitive to handle SCAA naming variations)
  const [raspberry] = await tx.select().from(tasteNotes).where(ilike(tasteNotes.name, 'Raspberry')).limit(1);
  const [darkChocolate] = await tx.select().from(tasteNotes).where(ilike(tasteNotes.name, 'Dark chocolate')).limit(1);
  const [rose] = await tx.select().from(tasteNotes).where(ilike(tasteNotes.name, 'Rose')).limit(1);
  const [caramelized] = await tx.select().from(tasteNotes).where(ilike(tasteNotes.name, 'Caramelized')).limit(1);

  const notesToInsert = [
    raspberry && { recipeVersionId, tasteNoteId: raspberry.id, intensity: 2 },
    darkChocolate && { recipeVersionId, tasteNoteId: darkChocolate.id, intensity: 3 },
    rose && { recipeVersionId, tasteNoteId: rose.id, intensity: 1 },
    caramelized && { recipeVersionId, tasteNoteId: caramelized.id, intensity: 2 },
  ].filter(Boolean);

  if (notesToInsert.length > 0) {
    await tx.insert(recipeTasteNotes).values(notesToInsert as any[]);
  }
}

async function main() {
  console.log('Seeding database...');

  await db.transaction(async (tx) => {
    await seedBrewMethodCompatibility(tx);
    await seedBadges(tx);

    const createdUsers = await seedUsers(tx);
    const {
      recipe1,
      recipe2,
      portafilter,
      basket,
      tamper,
      puckScreen,
      gooseneck,
      v60Filter,
      scale,
    } = await seedRecipes(tx, createdUsers);
    const seedEquipment = { portafilter, basket, tamper, puckScreen, gooseneck, v60Filter, scale };

    await seedSocialData(tx, createdUsers, { recipe1, recipe2 });
    await seedSetups(tx, createdUsers, seedEquipment);
  });

  const scaaPath = new URL('../../../files/scaa-2.json', import.meta.url);
  const scaaData: ScaaFile = JSON.parse(await Deno.readTextFile(scaaPath));

  // Query recipe1Version ID after the first transaction (created in seedRecipes)
  const recipe1Rows = await db.select().from(recipes).where(eq(recipes.slug, 'alices-signature-espresso')).limit(1);
  const recipe1VersionRows = await db.select().from(recipeVersions).where(eq(recipeVersions.recipeId, recipe1Rows[0].id)).limit(1);
  const recipe1VersionId = recipe1VersionRows[0].id;

  await db.transaction(async (tx) => {
    await seedTasteNotes(tx, scaaData.data);
    await seedRecipeTasteNotes(tx, recipe1VersionId);
  });

  const adminEmail = Deno.env.get('ADMIN_EMAIL') || 'admin@brewform.local';
  const adminPassword = Deno.env.get('ADMIN_PASSWORD') || 'admin123456';
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
