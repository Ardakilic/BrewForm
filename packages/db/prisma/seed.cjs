const { PrismaClient } = require('@prisma/client');
const bcryptjs = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function seedTasteNotes(tx, data) {
  for (const root of data) {
    const rootNote = await tx.tasteNote.create({
      data: {
        name: root.name,
        color: root.colour ?? null,
        definition: root.definition ?? null,
        depth: 0,
      },
    });

    if (root.children) {
      for (const child of root.children) {
        const childNote = await tx.tasteNote.create({
          data: {
            name: child.name,
            parentId: rootNote.id,
            color: child.colour ?? null,
            definition: child.definition ?? null,
            depth: 1,
          },
        });

        if (child.children) {
          for (const grandChild of child.children) {
            await tx.tasteNote.create({
              data: {
                name: grandChild.name,
                parentId: childNote.id,
                color: grandChild.colour ?? null,
                definition: grandChild.definition ?? null,
                depth: 2,
              },
            });
          }
        }
      }
    }
  }
}

async function seedBrewMethodCompatibility(tx) {
  const rules = [
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
    await tx.brewMethodEquipmentRule.create({ data: rule });
  }
}

async function seedBadges(tx) {
  const badges = [
    { name: 'First Brew', icon: 'coffee', rule: 'first_brew', description: 'Logged your first recipe', threshold: 1 },
    { name: 'Decade Brewer', icon: 'ten', rule: 'decade_brewer', description: '10 recipes logged', threshold: 10 },
    { name: 'Centurion', icon: '100', rule: 'centurion', description: '100 recipes logged', threshold: 100 },
    { name: 'First Fork', icon: 'fork_and_knife', rule: 'first_fork', description: 'Forked your first recipe', threshold: 1 },
    { name: 'Fan Favourite', icon: 'star', rule: 'fan_favourite', description: 'One of your recipes received 10+ likes', threshold: 10 },
    { name: 'Community Star', icon: 'star2', rule: 'community_star', description: 'One of your recipes received 50+ likes', threshold: 50 },
    { name: 'Conversationalist', icon: 'speech_balloon', rule: 'conversationalist', description: 'Left 10+ comments', threshold: 10 },
    { name: 'Precision Brewer', icon: 'dart', rule: 'precision_brewer', description: 'Logged 10 recipes with all optional fields filled', threshold: 10 },
    { name: 'Explorer', icon: 'globe', rule: 'explorer', description: 'Brewed with 5+ different brew methods', threshold: 5 },
    { name: 'Influencer', icon: 'busts_in_silhouette', rule: 'influencer', description: 'Gained 25+ followers', threshold: 25 },
  ];

  for (const badge of badges) {
    await tx.badge.create({ data: badge });
  }
}

async function seedUsers(tx) {
  const adminPassword = bcryptjs.hashSync('admin123456', 10);
  const user1Password = bcryptjs.hashSync('user123456', 10);
  const user2Password = bcryptjs.hashSync('user123456', 10);

  const admin = await tx.user.create({
    data: {
      email: 'admin@brewform.local',
      username: 'admin',
      passwordHash: adminPassword,
      displayName: 'BrewForm Admin',
      isAdmin: true,
      onboardingCompleted: true,
      preferences: { create: {} },
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
      preferences: { create: { unitSystem: 'metric', theme: 'coffee' } },
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
      preferences: { create: { unitSystem: 'metric', theme: 'dark' } },
    },
  });

  return { admin, user1, user2 };
}

async function seedRecipes(tx, users) {
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
    data: { currentVersionId: (await tx.recipeVersion.findFirst({ where: { recipeId: recipe1.id } })).id },
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
    data: { currentVersionId: (await tx.recipeVersion.findFirst({ where: { recipeId: recipe2.id } })).id },
  });

  return { recipe1, recipe2, portafilter, basket, tamper, puckScreen, gooseneck, v60Filter, scale };
}

async function seedSocialData(tx, users, recipes) {
  await tx.userFollow.create({
    data: { followerId: users.user2.id, followingId: users.user1.id },
  });

  await tx.userRecipeLike.create({
    data: { userId: users.user2.id, recipeId: recipes.recipe1.id },
  });

  await tx.userRecipeFavourite.create({
    data: { userId: users.user2.id, recipeId: recipes.recipe1.id },
  });

  const comment1 = await tx.comment.create({
    data: { recipeId: recipes.recipe1.id, authorId: users.user2.id, content: 'Amazing shot! What Grinder setting are you using?' },
  });

  await tx.comment.create({
    data: { recipeId: recipes.recipe1.id, authorId: users.user1.id, content: 'Thanks! Setting 12 on the Lelit Fred.', parentCommentId: comment1.id },
  });

  const firstBrewBadge = await tx.badge.findFirst({ where: { rule: 'first_brew' } });
  if (firstBrewBadge) {
    await tx.userBadge.create({
      data: { userId: users.user1.id, badgeId: firstBrewBadge.id },
    });
  }
}

async function seedSetups(tx, users, equipment) {
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
  const { recipe1, recipe2, portafilter, basket, tamper, puckScreen, gooseneck, v60Filter, scale } = await seedRecipes(prisma, users);
  const equipment = { portafilter, basket, tamper, puckScreen, gooseneck, v60Filter, scale };

  await seedSocialData(prisma, users, { recipe1, recipe2 });
  await seedSetups(prisma, users, equipment);

  const scaaData = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../files/scaa-2.json'), 'utf-8'));
  await seedTasteNotes(prisma, scaaData.data);

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