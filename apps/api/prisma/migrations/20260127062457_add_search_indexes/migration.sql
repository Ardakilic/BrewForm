-- CreateIndex
CREATE INDEX "coffees_origin_idx" ON "coffees"("origin");

-- CreateIndex
CREATE INDEX "coffees_variety_idx" ON "coffees"("variety");

-- CreateIndex
CREATE INDEX "recipe_versions_title_idx" ON "recipe_versions"("title");

-- CreateIndex
CREATE INDEX "recipe_versions_tags_idx" ON "recipe_versions"("tags");

-- CreateIndex
CREATE INDEX "users_displayName_idx" ON "users"("displayName");

-- CreateIndex
CREATE INDEX "users_emailVerified_idx" ON "users"("emailVerified");

-- CreateIndex
CREATE INDEX "users_createdAt_idx" ON "users"("createdAt");
