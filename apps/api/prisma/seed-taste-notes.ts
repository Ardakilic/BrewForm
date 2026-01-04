/**
 * BrewForm Taste Notes Seed
 * Populates the database with SCAA 2016 flavor wheel taste notes
 */

import process from 'node:process';
import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync } from 'node:fs';

const prisma = new PrismaClient();

interface TasteNoteJson {
  name: string;
  colour?: string;
  definition?: string;
  children?: TasteNoteJson[];
}

interface ScaaJson {
  meta: {
    maxDepth: number;
    name: string;
    type: string;
  };
  data: TasteNoteJson[];
}

/**
 * Create slug from text
 */
function createSlug(text: string, parentSlug?: string): string {
  const baseSlug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  
  return parentSlug ? `${parentSlug}-${baseSlug}` : baseSlug;
}

/**
 * Recursively seed taste notes
 */
async function seedTasteNotes(
  notes: TasteNoteJson[],
  parentId: string | null = null,
  depth = 0,
  parentSlug?: string
): Promise<number> {
  let count = 0;

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    const slug = createSlug(note.name, parentSlug);

    const created = await prisma.tasteNote.upsert({
      where: { slug },
      update: {
        name: note.name,
        colour: note.colour || null,
        definition: note.definition || null,
        depth,
        sortOrder: i,
        parentId,
      },
      create: {
        name: note.name,
        slug,
        parentId,
        depth,
        colour: note.colour || null,
        definition: note.definition || null,
        sortOrder: i,
      },
    });

    count++;

    if (note.children && note.children.length > 0) {
      count += await seedTasteNotes(note.children, created.id, depth + 1, slug);
    }
  }

  return count;
}

async function main() {
  console.log('🍵 Seeding taste notes from SCAA 2016 flavor wheel...\n');

  // Read the JSON file - /app/files in Docker container
  const jsonPath = '/app/files/scaa-2016-taste-wheel.json';
  
  if (!existsSync(jsonPath)) {
    throw new Error(`Taste wheel JSON file not found at: ${jsonPath}`);
  }

  const jsonContent = readFileSync(jsonPath, 'utf-8');
  const scaaData: ScaaJson = JSON.parse(jsonContent);

  console.log(`📖 Loaded ${scaaData.meta.name} flavor wheel`);
  console.log(`   Max depth: ${scaaData.meta.maxDepth}`);
  console.log(`   Top-level categories: ${scaaData.data.length}\n`);

  // Seed taste notes
  const totalCount = await seedTasteNotes(scaaData.data);

  console.log(`\n✅ Successfully seeded ${totalCount} taste notes!\n`);

  // Print summary by depth
  const depthCounts = await prisma.tasteNote.groupBy({
    by: ['depth'],
    _count: true,
    orderBy: { depth: 'asc' },
  });

  console.log('📊 Taste notes by depth:');
  for (const item of depthCounts) {
    const depthLabel = item.depth === 0 ? 'Top level' : item.depth === 1 ? 'Second level' : 'Third level';
    console.log(`   ${depthLabel} (depth ${item.depth}): ${item._count} notes`);
  }
}

main()
  .catch((e) => {
    console.error('❌ Taste notes seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

export { seedTasteNotes, createSlug };
