-- CreateTable
CREATE TABLE "taste_notes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "parentId" TEXT,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "colour" TEXT,
    "definition" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "taste_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_version_taste_notes" (
    "id" TEXT NOT NULL,
    "recipeVersionId" TEXT NOT NULL,
    "tasteNoteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipe_version_taste_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "taste_notes_slug_key" ON "taste_notes"("slug");

-- CreateIndex
CREATE INDEX "taste_notes_parentId_idx" ON "taste_notes"("parentId");

-- CreateIndex
CREATE INDEX "taste_notes_slug_idx" ON "taste_notes"("slug");

-- CreateIndex
CREATE INDEX "taste_notes_depth_idx" ON "taste_notes"("depth");

-- CreateIndex
CREATE INDEX "taste_notes_name_idx" ON "taste_notes"("name");

-- CreateIndex
CREATE INDEX "taste_notes_deletedAt_idx" ON "taste_notes"("deletedAt");

-- CreateIndex
CREATE INDEX "recipe_version_taste_notes_recipeVersionId_idx" ON "recipe_version_taste_notes"("recipeVersionId");

-- CreateIndex
CREATE INDEX "recipe_version_taste_notes_tasteNoteId_idx" ON "recipe_version_taste_notes"("tasteNoteId");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_version_taste_notes_recipeVersionId_tasteNoteId_key" ON "recipe_version_taste_notes"("recipeVersionId", "tasteNoteId");

-- AddForeignKey
ALTER TABLE "taste_notes" ADD CONSTRAINT "taste_notes_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "taste_notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_version_taste_notes" ADD CONSTRAINT "recipe_version_taste_notes_recipeVersionId_fkey" FOREIGN KEY ("recipeVersionId") REFERENCES "recipe_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_version_taste_notes" ADD CONSTRAINT "recipe_version_taste_notes_tasteNoteId_fkey" FOREIGN KEY ("tasteNoteId") REFERENCES "taste_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
