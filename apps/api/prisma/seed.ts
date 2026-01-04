/**
 * BrewForm Database Seed
 * Populates the database with initial data including:
 * - First admin user (password generated and printed to stdout)
 * - Sample equipment, vendors, coffees
 * - Sample recipes with realistic brewing data
 * - Brew method compatibility matrix
 */

import process from 'node:process';
import { PrismaClient, BrewMethodType, DrinkType, ProcessingMethod, EmojiRating } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { nanoid } from 'nanoid';

const prisma = new PrismaClient();

/**
 * Generate a secure random password
 */
function generatePassword(length = 16): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

async function main() {
  console.log('🌱 Starting database seed...\n');

  // ============================================
  // Create Admin User
  // ============================================
  
  const adminPassword = generatePassword();
  const adminPasswordHash = await hash(adminPassword, {
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  await prisma.user.upsert({
    where: { email: 'admin@brewform.local' },
    update: {},
    create: {
      email: 'admin@brewform.local',
      username: 'admin',
      displayName: 'Admin',
      passwordHash: adminPasswordHash,
      isAdmin: true,
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  console.log('👤 Admin user created:');
  console.log(`   Email: admin@brewform.local`);
  console.log(`   Password: ${adminPassword}`);
  console.log(`   ⚠️  Please change this password immediately!\n`);

  // ============================================
  // Create Sample Users
  // ============================================

  const samplePasswordHash = await hash('Password123!', {
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: 'coffee.lover@example.com' },
      update: {},
      create: {
        email: 'coffee.lover@example.com',
        username: 'coffeelover',
        displayName: 'Coffee Lover',
        passwordHash: samplePasswordHash,
        emailVerified: true,
        bio: 'Passionate about specialty coffee and espresso. Always chasing the perfect shot!',
      },
    }),
    prisma.user.upsert({
      where: { email: 'barista.pro@example.com' },
      update: {},
      create: {
        email: 'barista.pro@example.com',
        username: 'baristapro',
        displayName: 'Barista Pro',
        passwordHash: samplePasswordHash,
        emailVerified: true,
        bio: 'Professional barista with 10 years experience. SCA certified.',
      },
    }),
    prisma.user.upsert({
      where: { email: 'home.brewer@example.com' },
      update: {},
      create: {
        email: 'home.brewer@example.com',
        username: 'homebrewer',
        displayName: 'Home Brewer',
        passwordHash: samplePasswordHash,
        emailVerified: true,
        bio: 'V60 enthusiast exploring different origins and methods.',
      },
    }),
  ]);

  console.log(`👥 Created ${users.length} sample users\n`);

  // ============================================
  // Create Vendors
  // ============================================

  const vendors = await Promise.all([
    prisma.vendor.upsert({
      where: { slug: 'counter-culture-coffee' },
      update: {},
      create: {
        name: 'Counter Culture Coffee',
        slug: 'counter-culture-coffee',
        country: 'USA',
        website: 'https://counterculturecoffee.com',
        description: 'Pioneering specialty coffee roaster since 1995',
        isVerified: true,
      },
    }),
    prisma.vendor.upsert({
      where: { slug: 'intelligentsia-coffee' },
      update: {},
      create: {
        name: 'Intelligentsia Coffee',
        slug: 'intelligentsia-coffee',
        country: 'USA',
        website: 'https://www.intelligentsia.com',
        description: 'Direct trade coffee pioneers',
        isVerified: true,
      },
    }),
    prisma.vendor.upsert({
      where: { slug: 'square-mile-coffee' },
      update: {},
      create: {
        name: 'Square Mile Coffee Roasters',
        slug: 'square-mile-coffee',
        country: 'UK',
        website: 'https://shop.squaremilecoffee.com',
        description: 'London-based specialty roaster',
        isVerified: true,
      },
    }),
    prisma.vendor.upsert({
      where: { slug: 'onyx-coffee-lab' },
      update: {},
      create: {
        name: 'Onyx Coffee Lab',
        slug: 'onyx-coffee-lab',
        country: 'USA',
        website: 'https://onyxcoffeelab.com',
        description: 'Award-winning Arkansas roaster',
        isVerified: true,
      },
    }),
  ]);

  console.log(`🏪 Created ${vendors.length} vendors\n`);

  // ============================================
  // Create Coffees
  // ============================================

  const coffees = await Promise.all([
    prisma.coffee.upsert({
      where: { slug: 'counter-culture-hologram-' + nanoid(4) },
      update: {},
      create: {
        name: 'Hologram',
        slug: 'counter-culture-hologram-' + nanoid(4),
        vendorId: vendors[0].id,
        origin: 'Blend',
        description: 'Our flagship espresso blend - sweet, balanced, and chocolatey',
        flavorNotes: ['chocolate', 'caramel', 'nutty'],
        roastLevel: 'Medium',
      },
    }),
    prisma.coffee.upsert({
      where: { slug: 'ethiopia-yirgacheffe-' + nanoid(4) },
      update: {},
      create: {
        name: 'Ethiopia Yirgacheffe Kochere',
        slug: 'ethiopia-yirgacheffe-' + nanoid(4),
        vendorId: vendors[1].id,
        origin: 'Ethiopia',
        region: 'Yirgacheffe',
        altitude: 1900,
        variety: 'Heirloom',
        processingMethod: ProcessingMethod.WASHED,
        flavorNotes: ['jasmine', 'bergamot', 'lemon'],
        roastLevel: 'Light',
      },
    }),
    prisma.coffee.upsert({
      where: { slug: 'colombia-huila-' + nanoid(4) },
      update: {},
      create: {
        name: 'Colombia Huila El Paraiso',
        slug: 'colombia-huila-' + nanoid(4),
        vendorId: vendors[2].id,
        origin: 'Colombia',
        region: 'Huila',
        farm: 'El Paraiso',
        altitude: 1750,
        variety: 'Caturra',
        processingMethod: ProcessingMethod.HONEY,
        flavorNotes: ['red apple', 'honey', 'milk chocolate'],
        roastLevel: 'Medium-Light',
      },
    }),
    prisma.coffee.upsert({
      where: { slug: 'guatemala-antigua-' + nanoid(4) },
      update: {},
      create: {
        name: 'Guatemala Antigua',
        slug: 'guatemala-antigua-' + nanoid(4),
        vendorId: vendors[3].id,
        origin: 'Guatemala',
        region: 'Antigua',
        altitude: 1600,
        variety: 'Bourbon',
        processingMethod: ProcessingMethod.WASHED,
        flavorNotes: ['dark chocolate', 'orange', 'brown sugar'],
        roastLevel: 'Medium',
      },
    }),
  ]);

  console.log(`☕ Created ${coffees.length} coffees\n`);

  // ============================================
  // Create Grinders
  // ============================================

  const grinders = await Promise.all([
    prisma.grinder.upsert({
      where: { slug: 'niche-zero' },
      update: {},
      create: {
        brand: 'Niche',
        model: 'Zero',
        slug: 'niche-zero',
        type: 'conical burr',
        burrSize: 63,
        description: 'Single dose conical burr grinder',
      },
    }),
    prisma.grinder.upsert({
      where: { slug: 'baratza-encore' },
      update: {},
      create: {
        brand: 'Baratza',
        model: 'Encore',
        slug: 'baratza-encore',
        type: 'conical burr',
        burrSize: 40,
        description: 'Entry-level home grinder',
      },
    }),
    prisma.grinder.upsert({
      where: { slug: 'eureka-mignon-specialita' },
      update: {},
      create: {
        brand: 'Eureka',
        model: 'Mignon Specialita',
        slug: 'eureka-mignon-specialita',
        type: 'flat burr',
        burrSize: 55,
        description: 'Premium home espresso grinder',
      },
    }),
    prisma.grinder.upsert({
      where: { slug: 'comandante-c40' },
      update: {},
      create: {
        brand: 'Comandante',
        model: 'C40 MK4',
        slug: 'comandante-c40',
        type: 'conical burr',
        burrSize: 39,
        description: 'Premium hand grinder',
      },
    }),
  ]);

  console.log(`⚙️  Created ${grinders.length} grinders\n`);

  // ============================================
  // Create Brewers
  // ============================================

  const brewers = await Promise.all([
    prisma.brewer.upsert({
      where: { slug: 'la-marzocco-linea-mini' },
      update: {},
      create: {
        brand: 'La Marzocco',
        model: 'Linea Mini',
        slug: 'la-marzocco-linea-mini',
        brewMethod: BrewMethodType.ESPRESSO_MACHINE,
        type: 'semi-automatic',
        description: 'Prosumer dual boiler espresso machine',
      },
    }),
    prisma.brewer.upsert({
      where: { slug: 'hario-v60-02' },
      update: {},
      create: {
        brand: 'Hario',
        model: 'V60 02 Ceramic',
        slug: 'hario-v60-02',
        brewMethod: BrewMethodType.POUR_OVER_V60,
        type: 'manual',
        description: 'Classic pour-over dripper',
      },
    }),
    prisma.brewer.upsert({
      where: { slug: 'aeropress-original' },
      update: {},
      create: {
        brand: 'AeroPress',
        model: 'Original',
        slug: 'aeropress-original',
        brewMethod: BrewMethodType.AEROPRESS,
        type: 'manual',
        description: 'Versatile pressure brewer',
      },
    }),
    prisma.brewer.upsert({
      where: { slug: 'chemex-6-cup' },
      update: {},
      create: {
        brand: 'Chemex',
        model: '6-Cup Classic',
        slug: 'chemex-6-cup',
        brewMethod: BrewMethodType.POUR_OVER_CHEMEX,
        type: 'manual',
        description: 'Elegant pour-over brewer',
      },
    }),
  ]);

  console.log(`🔧 Created ${brewers.length} brewers\n`);

  // ============================================
  // Create Baskets
  // ============================================

  const baskets = await Promise.all([
    prisma.basket.upsert({
      where: { slug: 'ims-h24' },
      update: {},
      create: {
        brand: 'IMS',
        model: 'Competition H24',
        slug: 'ims-h24',
        size: 24,
        type: 'precision',
        description: '24g competition basket',
      },
    }),
    prisma.basket.upsert({
      where: { slug: 'vst-18' },
      update: {},
      create: {
        brand: 'VST',
        model: '18g Precision',
        slug: 'vst-18',
        size: 18,
        type: 'precision',
        description: '18g precision basket',
      },
    }),
  ]);

  console.log(`🧺 Created ${baskets.length} baskets\n`);

  // ============================================
  // Create Portafilters
  // ============================================

  const portafilters = await Promise.all([
    prisma.portafilter.upsert({
      where: { slug: 'bottomless-58mm' },
      update: {},
      create: {
        model: '58mm Bottomless',
        slug: 'bottomless-58mm',
        type: 'bottomless',
        size: 58,
        description: 'Standard bottomless portafilter',
      },
    }),
    prisma.portafilter.upsert({
      where: { slug: 'double-spout-58mm' },
      update: {},
      create: {
        model: '58mm Double Spout',
        slug: 'double-spout-58mm',
        type: 'spouted',
        size: 58,
        description: 'Traditional double spout portafilter',
      },
    }),
  ]);

  console.log(`🍳 Created ${portafilters.length} portafilters\n`);

  // ============================================
  // Create Brew Method Compatibility Matrix
  // ============================================

  const compatibilities: Array<{ brewMethod: BrewMethodType; drinkType: DrinkType }> = [
    // Espresso machine drinks
    { brewMethod: BrewMethodType.ESPRESSO_MACHINE, drinkType: DrinkType.ESPRESSO },
    { brewMethod: BrewMethodType.ESPRESSO_MACHINE, drinkType: DrinkType.RISTRETTO },
    { brewMethod: BrewMethodType.ESPRESSO_MACHINE, drinkType: DrinkType.LUNGO },
    { brewMethod: BrewMethodType.ESPRESSO_MACHINE, drinkType: DrinkType.AMERICANO },
    { brewMethod: BrewMethodType.ESPRESSO_MACHINE, drinkType: DrinkType.LATTE },
    { brewMethod: BrewMethodType.ESPRESSO_MACHINE, drinkType: DrinkType.CAPPUCCINO },
    { brewMethod: BrewMethodType.ESPRESSO_MACHINE, drinkType: DrinkType.FLAT_WHITE },
    { brewMethod: BrewMethodType.ESPRESSO_MACHINE, drinkType: DrinkType.CORTADO },
    { brewMethod: BrewMethodType.ESPRESSO_MACHINE, drinkType: DrinkType.MACCHIATO },
    { brewMethod: BrewMethodType.ESPRESSO_MACHINE, drinkType: DrinkType.MOCHA },
    // Pour over
    { brewMethod: BrewMethodType.POUR_OVER_V60, drinkType: DrinkType.POUR_OVER },
    { brewMethod: BrewMethodType.POUR_OVER_CHEMEX, drinkType: DrinkType.POUR_OVER },
    { brewMethod: BrewMethodType.POUR_OVER_KALITA, drinkType: DrinkType.POUR_OVER },
    // French press
    { brewMethod: BrewMethodType.FRENCH_PRESS, drinkType: DrinkType.FRENCH_PRESS },
    // AeroPress
    { brewMethod: BrewMethodType.AEROPRESS, drinkType: DrinkType.POUR_OVER },
    { brewMethod: BrewMethodType.AEROPRESS, drinkType: DrinkType.ESPRESSO },
    // Turkish
    { brewMethod: BrewMethodType.TURKISH_CEZVE, drinkType: DrinkType.TURKISH_COFFEE },
    { brewMethod: BrewMethodType.IBRIK, drinkType: DrinkType.TURKISH_COFFEE },
    // Cold brew
    { brewMethod: BrewMethodType.COLD_BREW, drinkType: DrinkType.COLD_BREW },
    { brewMethod: BrewMethodType.COLD_BREW, drinkType: DrinkType.ICED_COFFEE },
  ];

  for (const compat of compatibilities) {
    await prisma.brewMethodCompatibility.upsert({
      where: {
        brewMethod_drinkType: {
          brewMethod: compat.brewMethod,
          drinkType: compat.drinkType,
        },
      },
      update: {},
      create: {
        brewMethod: compat.brewMethod,
        drinkType: compat.drinkType,
        isValid: true,
      },
    });
  }

  console.log(`✅ Created ${compatibilities.length} brew method compatibilities\n`);

  // ============================================
  // Create Sample Recipes
  // ============================================

  const recipes = [];

  // Recipe 1: Classic Espresso
  const espressoRecipe = await prisma.recipe.create({
    data: {
      userId: users[0].id,
      slug: 'classic-morning-espresso-' + nanoid(8),
      visibility: 'PUBLIC',
      versions: {
        create: {
          userId: users[0].id,
          versionNumber: 1,
          title: 'Classic Morning Espresso',
          description: 'My go-to morning espresso recipe. Balanced and sweet with notes of chocolate.',
          brewMethod: BrewMethodType.ESPRESSO_MACHINE,
          drinkType: DrinkType.ESPRESSO,
          coffeeId: coffees[0].id,
          coffeeName: coffees[0].name,
          grinderId: grinders[2].id,
          brewerId: brewers[0].id,
          basketId: baskets[0].id,
          portafilterId: portafilters[0].id,
          grindSize: '2.5',
          doseGrams: 18,
          yieldGrams: 36,
          yieldMl: 40,
          brewTimeSec: 28,
          tempCelsius: 93,
          brewRatio: 2.0,
          flowRate: 1.43,
          tastingNotes: 'Sweet and balanced with dark chocolate notes. Silky mouthfeel with a pleasant caramel finish.',
          rating: 9,
          emojiRating: EmojiRating.SUPER_GOOD,
          isFavourite: true,
          tags: ['espresso', 'morning', 'chocolate'],
        },
      },
    },
    include: { versions: true },
  });

  await prisma.recipe.update({
    where: { id: espressoRecipe.id },
    data: { currentVersionId: espressoRecipe.versions[0].id },
  });
  recipes.push(espressoRecipe);

  // Recipe 2: V60 Pour Over
  const v60Recipe = await prisma.recipe.create({
    data: {
      userId: users[2].id,
      slug: 'ethiopian-v60-' + nanoid(8),
      visibility: 'PUBLIC',
      versions: {
        create: {
          userId: users[2].id,
          versionNumber: 1,
          title: 'Ethiopian V60 - Floral Notes',
          description: 'Single origin pour-over highlighting floral and citrus notes from Yirgacheffe.',
          brewMethod: BrewMethodType.POUR_OVER_V60,
          drinkType: DrinkType.POUR_OVER,
          coffeeId: coffees[1].id,
          coffeeName: coffees[1].name,
          grinderId: grinders[3].id,
          brewerId: brewers[1].id,
          grindSize: '22 clicks',
          doseGrams: 15,
          yieldGrams: 250,
          yieldMl: 250,
          brewTimeSec: 180,
          tempCelsius: 94,
          brewRatio: 16.67,
          flowRate: 1.39,
          tastingNotes: 'Bright and complex with jasmine and bergamot aromatics. Clean lemon acidity with a tea-like body.',
          rating: 8,
          emojiRating: EmojiRating.GOOD,
          tags: ['v60', 'pourover', 'floral', 'ethiopian'],
        },
      },
    },
    include: { versions: true },
  });

  await prisma.recipe.update({
    where: { id: v60Recipe.id },
    data: { currentVersionId: v60Recipe.versions[0].id },
  });
  recipes.push(v60Recipe);

  // Recipe 3: AeroPress
  const aeropressRecipe = await prisma.recipe.create({
    data: {
      userId: users[1].id,
      slug: 'competition-aeropress-' + nanoid(8),
      visibility: 'PUBLIC',
      versions: {
        create: {
          userId: users[1].id,
          versionNumber: 1,
          title: 'Competition-Style AeroPress',
          description: 'Competition-inspired recipe with inverted method and long steep.',
          brewMethod: BrewMethodType.AEROPRESS,
          drinkType: DrinkType.POUR_OVER,
          coffeeId: coffees[2].id,
          coffeeName: coffees[2].name,
          grinderId: grinders[3].id,
          brewerId: brewers[2].id,
          grindSize: '18 clicks',
          doseGrams: 17,
          yieldGrams: 200,
          yieldMl: 200,
          brewTimeSec: 120,
          tempCelsius: 85,
          brewRatio: 11.76,
          preparations: [
            { name: 'Water', type: 'Filtered', input: '220ml', method: 'Kettle' },
          ],
          tastingNotes: 'Sweet and clean with notes of red apple and honey. Medium body with a smooth finish.',
          rating: 8,
          emojiRating: EmojiRating.GOOD,
          tags: ['aeropress', 'competition', 'inverted'],
        },
      },
    },
    include: { versions: true },
  });

  await prisma.recipe.update({
    where: { id: aeropressRecipe.id },
    data: { currentVersionId: aeropressRecipe.versions[0].id },
  });
  recipes.push(aeropressRecipe);

  // Recipe 4: Cortado
  const cortadoRecipe = await prisma.recipe.create({
    data: {
      userId: users[0].id,
      slug: 'afternoon-cortado-' + nanoid(8),
      visibility: 'PUBLIC',
      versions: {
        create: {
          userId: users[0].id,
          versionNumber: 1,
          title: 'Perfect Afternoon Cortado',
          description: 'Balanced cortado with equal parts espresso and steamed milk.',
          brewMethod: BrewMethodType.ESPRESSO_MACHINE,
          drinkType: DrinkType.CORTADO,
          coffeeId: coffees[3].id,
          coffeeName: coffees[3].name,
          grinderId: grinders[0].id,
          brewerId: brewers[0].id,
          basketId: baskets[1].id,
          portafilterId: portafilters[0].id,
          grindSize: '15',
          doseGrams: 18,
          yieldGrams: 40,
          yieldMl: 42,
          brewTimeSec: 30,
          tempCelsius: 93,
          brewRatio: 2.22,
          preparations: [
            { name: 'Milk', type: 'Whole milk', input: '60ml', method: 'Steamed to 55°C' },
          ],
          tastingNotes: 'Perfect balance of espresso and milk. Dark chocolate and orange notes shine through.',
          rating: 9,
          emojiRating: EmojiRating.SUPER_GOOD,
          isFavourite: true,
          tags: ['cortado', 'milk', 'afternoon'],
        },
      },
    },
    include: { versions: true },
  });

  await prisma.recipe.update({
    where: { id: cortadoRecipe.id },
    data: { currentVersionId: cortadoRecipe.versions[0].id },
  });
  recipes.push(cortadoRecipe);

  console.log(`📝 Created ${recipes.length} sample recipes\n`);

  // ============================================
  // Add some favourites
  // ============================================

  await prisma.userFavourite.createMany({
    data: [
      { userId: users[1].id, recipeId: espressoRecipe.id },
      { userId: users[2].id, recipeId: espressoRecipe.id },
      { userId: users[0].id, recipeId: v60Recipe.id },
      { userId: users[1].id, recipeId: aeropressRecipe.id },
    ],
    skipDuplicates: true,
  });

  // Update favourite counts
  await prisma.recipe.update({
    where: { id: espressoRecipe.id },
    data: { favouriteCount: 2 },
  });
  await prisma.recipe.update({
    where: { id: v60Recipe.id },
    data: { favouriteCount: 1 },
  });
  await prisma.recipe.update({
    where: { id: aeropressRecipe.id },
    data: { favouriteCount: 1 },
  });

  console.log(`⭐ Added sample favourites\n`);

  // ============================================
  // Add some comments
  // ============================================

  await prisma.comment.create({
    data: {
      userId: users[1].id,
      recipeId: espressoRecipe.id,
      content: 'Great recipe! I tried it with the IMS basket and got even better results. The chocolate notes really come through.',
    },
  });

  await prisma.comment.create({
    data: {
      userId: users[2].id,
      recipeId: v60Recipe.id,
      content: 'Love the floral notes from this Yirgacheffe. What water temperature do you use for the bloom?',
    },
  });

  await prisma.recipe.update({
    where: { id: espressoRecipe.id },
    data: { commentCount: 1 },
  });
  await prisma.recipe.update({
    where: { id: v60Recipe.id },
    data: { commentCount: 1 },
  });

  console.log(`💬 Added sample comments\n`);

  console.log('✅ Database seed completed successfully!\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
