# Feature Suggestions — BrewForm

> Based on comprehensive codebase analysis of API (18 modules), Web (28+ pages), Database (22 tables), and shared packages.

---

## 1. User Experience & Social Features

### 1.1 Recipe Collections / Playlists
- **Current state**: Users can only favourite individual recipes.
- **Suggestion**: Allow users to create named collections (e.g., "Morning Pour-overs", "Espresso Experiments") that group multiple recipes. Collections can be public or private.
- **Why**: Improves recipe discovery and personal organisation. Common feature in recipe platforms.
- **PRD**: [`plans/F01-recipe-collections.md`](plans/F01-recipe-collections.md)

### 1.2 Recipe Notes from Other Users
- **Current state**: Personal notes are private to the recipe author only.
- **Suggestion**: Allow users to add personal notes/tasting notes to any recipe they've brewed (visible only to themselves), creating a "brew journal" entry per recipe.
- **Why**: Users want to track their own modifications and results without forking.
- **PRD**: [`plans/F02-brew-journal.md`](plans/F02-brew-journal.md)

### 1.3 User Profiles — Public Brew Stats Dashboard
- **Current state**: User profiles show basic stats (recipes, followers, following) and tabbed content.
- **Suggestion**: Add a public stats dashboard: most-used brew methods, average ratings given, favourite equipment, brewing frequency over time (chart).
- **Why**: Adds gamification and social proof without requiring new tables — data exists in existing `userRecipeLikes`, `userRecipeRatings`, `recipeVersion` tables.
- **PRD**: [`plans/F03-user-profile-stats.md`](plans/F03-user-profile-stats.md)

### 1.4 Recipe "Brew Again" / Replicate Workflow
- **Current state**: Fork creates a copy. No "I brewed this" tracking.
- **Suggestion**: Add a "Brew This" button that logs a brew event (date, any deviations from recipe, personal rating). This populates a user's brew history and provides aggregate data (e.g., "This recipe has been brewed 47 times").
- **Why**: Coffee brewing is iterative. Users want to track results from the same recipe over time.
- **PRD**: [`plans/F02-brew-journal.md`](plans/F02-brew-journal.md)

### 1.5 Equipment Reviews / Ratings
- **Current state**: Equipment is a static catalog with no user feedback.
- **Suggestion**: Allow users to rate equipment (1-10) and add short reviews. Aggregate into equipment detail pages.
- **Why**: Equipment recommendations are a top need for coffee enthusiasts. Data exists in `recipe_equipment` to derive usage stats.

### 1.6 Brew Method Tutorials / Guided Brews
- **Current state**: Equipment compatibility rules exist but aren't surfaced to users.
- **Suggestion**: Interactive step-by-step brew guides per method, integrating equipment compatibility rules. Could show recommended equipment, step timings, and water temperature curves.
- **Why**: Onboarding new users and improving brew quality.

---

## 2. Recipe Features

### 2.1 Recipe Templates
- **Current state**: Recipes can only be created from scratch or forked.
- **Suggestion**: System-defined and user-defined templates (e.g., "V60 Template", "Espresso Template") that pre-fill brew parameters with sensible defaults per method.
- **Why**: Reduces friction for new users and standardises brewing.
- **PRD**: [`plans/F06-recipe-templates.md`](plans/F06-recipe-templates.md)

### 2.2 Batch / Scale Recipe Calculator
- **Current state**: `computeBrewRatio()` exists in shared utils but is not surfaced in the UI.
- **Suggestion**: A recipe scaling calculator: input desired yield, auto-calculate dose, grind time adjustments, and water volume. Show metric/imperial conversion live.
- **Why**: Users frequently scale recipes for different serving sizes.
- **PRD**: [`plans/F07-batch-calculator.md`](plans/F07-batch-calculator.md)

### 2.3 Recipe Comparison Improvements
- **Current state**: `RecipeComparePage` shows side-by-side brew params.
- **Suggestion**: Add diff highlighting (which params differ), visual overlays for extraction time/yield charts, and a "merge" option to create a new recipe from the best of both.
- **Why**: Comparison without diffing is just two columns. Users need to see what changed.
- **PRD**: [`plans/F08-recipe-comparison-improvements.md`](plans/F08-recipe-comparison-improvements.md)

### 2.4 Recipe Version Diff View
- **Current state**: `RecipeVersionsPage` lists versions with params.
- **Suggestion**: Side-by-side diff between any two versions, showing exactly which parameters changed, who changed them, and when.
- **Why**: Critical for understanding recipe evolution.
- **PRD**: [`plans/F09-version-diff.md`](plans/F09-version-diff.md)

### 2.5 Recipe Export / Import
- **Current state**: No export capability.
- **Suggestion**: Export recipes as PDF, JSON, or shareable link. Import from JSON or other platforms (Beanconqueror, Artisan).
- **Why**: Users want portable recipes and offline access.
- **PRD**: [`plans/F10-recipe-export-import.md`](plans/F10-recipe-export-import.md)

---

## 3. Discovery & Search

### 3.1 Advanced Search with Faceted Filters
- **Current state**: Recipe list supports filtering by brew method, drink type, equipment, taste notes, coffee variety, and search text. Pagination is offset-based.
- **Suggestion**: Add full-text search with ranking (PostgreSQL `tsvector`), filter by author, date range, rating range, and equipment compatibility. Switch to cursor-based pagination for performance at scale.
- **Why**: Offset pagination degrades at scale; faceted search improves discovery.
- **PRD**: [`plans/F11-advanced-search.md`](plans/F11-advanced-search.md)

### 3.2 "Similar Recipes" Recommendations
- **Current state**: No recommendation engine.
- **Suggestion**: Show "Similar Recipes" on recipe detail pages based on: same brew method + taste notes overlap + equipment overlap. Can be computed from existing data without ML.
- **Why**: Discovery is the #1 growth driver for content platforms.
- **PRD**: [`plans/F12-similar-recipes.md`](plans/F12-similar-recipes.md)

### 3.3 Trending / Popular Recipes
- **Current state**: `HomePage` shows "Latest" and "Popular" grids (6 each).
- **Suggestion**: Expand to a dedicated explore page with time-window trending (today, this week, this month), category-based browsing, and editor picks (admin-featured).
- **Why**: Homepage grids are insufficient for discovery at scale.
- **PRD**: [`plans/F13-trending-explore.md`](plans/F13-trending-explore.md)

### 3.4 Brew Method Landing Pages
- **Current state**: Brew method is a filter option only.
- **Suggestion**: Dedicated landing pages per brew method (e.g., `/brew/v60`, `/brew/espresso`) with top recipes, guides, recommended equipment, and community stats.
- **Why**: SEO value and user education.
- **PRD**: [`plans/F14-brew-method-pages.md`](plans/F14-brew-method-pages.md)

---

## 4. Notification & Communication

### 4.1 In-App Notification Center
- **Current state**: Notifications are email-only (new follower, recipe liked, recipe commented, followed user posted).
- **Suggestion**: Add an in-app notification bell with unread count, notification list, and mark-as-read. Store notifications in a new `notification` table.
- **Why**: Users don't always check email. In-app notifications drive engagement.
- **PRD**: [`plans/F05-in-app-notifications.md`](plans/F05-in-app-notifications.md)

### 4.2 @Mention Notifications
- **Current state**: Comments support @mentions (auto-prepended), but no notification is sent.
- **Suggestion**: When a comment contains @username, send a notification (in-app + optional email) to the mentioned user.
- **Why**: Mentions without notification are broken social features.
- **PRD**: [`plans/F04-mention-notifications.md`](plans/F04-mention-notifications.md)

### 4.3 Recipe Activity Feed
- **Current state**: `GET /follow/feed` returns recipes from followed users.
- **Suggestion**: Expand feed to include: new comments on recipes you follow, equipment additions, brew journal entries from followed users.
- **Why**: Increases engagement and return visits.
- **PRD**: [`plans/F26-activity-feed.md`](plans/F26-activity-feed.md)

---

## 5. Admin & Moderation

### 5.1 Content Moderation Queue
- **Current state**: Reports exist (`report` table) with resolve/dismiss actions.
- **Suggestion**: Build a moderation dashboard queue: flagged content, pending reports, recently reported users. Add auto-flagging rules (e.g., recipes with profanity, rapid-fire comments).
- **Why**: Manual report review doesn't scale.
- **PRD**: [`plans/F15-admin-moderation.md`](plans/F15-admin-moderation.md)

### 5.2 Automated Badge Criteria Expansion
- **Current state**: 10 badge rules (first_brew, decade_brewer, centurion, etc.).
- **Suggestion**: Add more badge categories: social badges (first follow, 100 followers), equipment badges (complete espresso setup), taste badges (tried all brew methods), community badges (first comment, 100 comments).
- **Why**: Gamification drives engagement. Current rules are all quantity-based.
- **PRD**: [`plans/F16-badge-expansion.md`](plans/F16-badge-expansion.md)

### 5.3 Admin Analytics Dashboard Improvements
- **Current state**: `AdminDashboard` shows basic counts.
- **Suggestion**: Add time-series charts (user growth, recipe creation trends, active users), retention metrics, and exportable reports.
- **Why**: Basic counts don't inform decisions.
- **PRD**: [`plans/F17-admin-analytics.md`](plans/F17-admin-analytics.md)

### 5.4 Bulk Operations
- **Current state**: No bulk endpoints exist.
- **Suggestion**: Bulk user actions (ban/unban, delete), bulk recipe moderation (approve/reject/feature), bulk equipment management.
- **Why**: Admin workflows are tedious without bulk operations.
- **PRD**: [`plans/F18-bulk-operations.md`](plans/F18-bulk-operations.md)

---

## 6. Data & Integrations

### 6.1 Coffee Bean Database Import
- **Current state**: Beans are manually entered per user.
- **Suggestion**: Integrate with external coffee bean databases (e.g., Coffee Review, Good Coffee) for auto-population of bean metadata (origin, altitude, processing method, cupping score).
- **Why**: Manual data entry is tedious and inconsistent.
- **PRD**: [`plans/F19-bean-import.md`](plans/F19-bean-import.md)

### 6.2 Brew Logger Integration
- **Current state**: No integration with brewing apps.
- **Suggestion**: Import/export with popular brew logging apps (Beanconqueror, Artisan, Bripe). Support CSV/JSON import of brew data.
- **Why**: Users already track brews elsewhere. Reduces friction to adopt BrewForm.
- **PRD**: [`plans/F20-brew-logger-integration.md`](plans/F20-brew-logger-integration.md)

### 6.3 API v2 — Public API
- **Current state**: Internal API only, no public API documentation beyond OpenAPI spec.
- **Suggestion**: Create a versioned public API with API key authentication, rate limiting per key, and developer documentation. Enable third-party integrations.
- **Why**: Ecosystem growth through developer adoption.
- **PRD**: [`plans/F21-public-api.md`](plans/F21-public-api.md)

### 6.4 Webhook System
- **Current state**: No outbound event system beyond email.
- **Suggestion**: Allow users to register webhooks for events (new recipe, new follower, badge earned). Useful for Discord bots, Slack integrations, IFTTT.
- **Why**: Extends platform reach without building every integration.
- **PRD**: [`plans/F22-webhooks.md`](plans/F22-webhooks.md)

---

## 7. Performance & Quality

### 7.1 Image Optimisation Pipeline
- **Current state**: Photos are uploaded and stored as-is with a thumbnail.
- **Suggestion**: Add WebP/AVIF conversion, responsive image sizes (320w, 640w, 1280w), and lazy loading with blur placeholders.
- **Why**: Recipe photos are critical UX; current implementation doesn't optimise for web.
- **PRD**: [`plans/F23-image-optimisation.md`](plans/F23-image-optimisation.md)

### 7.2 Recipe Version Snapshots
- **Current state**: `recipeVersion` stores denormalized brew parameters.
- **Suggestion**: Ensure version snapshots are truly immutable (add DB-level `NOT INSERT`/`NOT UPDATE` triggers or application-level guards). Add version comparison metadata (what changed from previous version).
- **Why**: Versioning is only useful if versions are immutable.
- **PRD**: [`plans/F24-version-snapshots.md`](plans/F24-version-snapshots.md)

### 7.3 Offline Support / PWA
- **Current state**: No service worker or offline capability.
- **Suggestion**: Add a service worker for recipe detail pages (cache viewed recipes), offline brew logging that syncs when online, and a web manifest for "Add to Home Screen".
- **Why**: Users brew in kitchens with spotty WiFi.
- **PRD**: [`plans/F25-pwa-offline.md`](plans/F25-pwa-offline.md)

---

## 8. Monetisation (Future Consideration)

### 8.1 Premium Features
- **Potential**: Advanced analytics (extraction yield tracking over time), unlimited recipe versions, priority support, custom themes, team/organisation accounts.
- **Why**: Sustainable revenue model for a niche platform.

### 8.2 Equipment Affiliate Links
- **Potential**: Add affiliate links to equipment catalog pages (Amazon, specialty coffee retailers).
- **Why**: Equipment recommendations are high-intent purchase signals.

---

## Priority Matrix

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| **P0** | @Mention notifications | Low | High |
| **P0** | Recipe version diff view | Medium | High |
| **P0** | Fix broken fork navigation | Trivial | High |
| **P1** | In-app notification center | High | High |
| **P1** | Recipe collections/playlists | Medium | High |
| **P1** | Advanced search with faceted filters | Medium | High |
| **P1** | Image optimisation pipeline | Medium | Medium |
| **P2** | Brew "again" / replicate workflow | Medium | Medium |
| **P2** | Recipe templates | Low | Medium |
| **P2** | Batch/scale calculator | Low | Medium |
| **P2** | Similar recipes recommendations | Medium | Medium |
| **P2** | Equipment reviews/ratings | Medium | Medium |
| **P3** | Brew method landing pages | Medium | Low |
| **P3** | Recipe export/import | Medium | Medium |
| **P3** | Admin analytics improvements | Medium | Low |
| **P3** | Offline support / PWA | High | Medium |
| **P3** | Public API | High | Medium |
