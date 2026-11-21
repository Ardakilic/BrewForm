## MODIFIED Requirements

### Requirement: Brew log service layer

The system SHALL add `apps/api/src/modules/brew-log/service.ts` with a module-scoped
`createLogger('brew-log-service')` logger and entry/exit debug logs plus error logs (with `err`)
on every public function. Functions:

- `createBrewLog(userId, data)` — SHALL throw `'RECIPE_NOT_FOUND'` if the recipe does not exist,
  is soft-deleted, or fails `canViewRecipe(recipe, userId)` imported from
  `apps/api/src/modules/recipe/service.ts`. That means it accepts `public` and `unlisted` recipes for
  any caller, and `draft`/`private` recipes only for their author. The hand-written
  `recipe.visibility !== 'public' && recipe.authorId !== userId` check (`brew-log/service.ts:27`) is
  removed, so a signed-in holder of an `unlisted` recipe's link can use "Brew again" (capability
  `recipe-visibility`, "Unlisted recipes stay usable through their direct link"). The resulting log
  is visible only to its owner. SHALL throw `'RECIPE_VERSION_MISMATCH'` if `recipeVersionId` does not
  belong to that recipe.
- `updateBrewLog(userId, id, data)` and `deleteBrewLog(userId, id)` — SHALL throw
  `'BREW_LOG_NOT_FOUND'` when the log does not exist or belongs to another user (no ownership
  leakage), and `'FORBIDDEN'` is NOT required because non-ownership maps to not-found.
- `listUserBrewLogs(userId, page, perPage)`, `listRecipeBrewLogs(userId, recipeId, page, perPage)`
  (owner-scoped), `getRecipeBrewStats(recipeId)`, `getUserBrewStats(userId)`.

#### Scenario: Users cannot read or modify another user's brew log

- **WHEN** user B calls `updateBrewLog` or `deleteBrewLog` with user A's brew log id
- **THEN** the service throws `'BREW_LOG_NOT_FOUND'` and the log is unchanged

#### Scenario: Create validates recipe accessibility

- **WHEN** `createBrewLog` is called with a soft-deleted recipe id, or with another user's private
  or draft recipe id
- **THEN** the service throws `'RECIPE_NOT_FOUND'` and no row is inserted

#### Scenario: Create accepts another user's unlisted recipe

- **WHEN** user B calls `createBrewLog` for user A's `unlisted` recipe
- **THEN** the log is created for B, `POST /api/v1/brew-logs` returns `201`, and the log appears in B's `GET /api/v1/brew-logs` and in no other user's list

#### Scenario: Create validates version belongs to recipe

- **WHEN** `createBrewLog` is called with a `recipeVersionId` that belongs to a different recipe
- **THEN** the service throws `'RECIPE_VERSION_MISMATCH'`
