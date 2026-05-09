# Email Notifications

BrewForm sends transactional and social-event emails through a single SMTP transport (Mailpit in
development, a production SMTP host configured via env in production).

For the design rationale see `decisions.md` ADR-011 (fire-and-forget delivery).

## Categories

| Category             | Triggered when                                                             | Module                                             | Template                    | Preference flag                      |
| -------------------- | -------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------- | ------------------------------------ |
| Welcome              | New account registered                                                     | `modules/auth/email.ts:sendWelcomeEmail`           | `welcome.mjml`              | always sent                          |
| Password reset       | `POST /auth/forgot-password` succeeds for an existing email                | `modules/auth/email.ts:sendPasswordResetEmail`     | `reset-password.mjml`       | always sent                          |
| New follower         | `follow.followUser` succeeds                                               | `utils/notify/index.ts:notifyNewFollower`          | `new-follower.mjml`         | `UserPreferences.newFollower`        |
| Recipe liked         | `recipe.toggleLike` flips to `liked: true` and the liker is not the author | `utils/notify/index.ts:notifyRecipeLiked`          | `recipe-liked.mjml`         | `UserPreferences.recipeLiked`        |
| Recipe commented     | `comment.createComment` succeeds and the commenter is not the author       | `utils/notify/index.ts:notifyRecipeCommented`      | `recipe-commented.mjml`     | `UserPreferences.recipeCommented`    |
| Followed user posted | `recipe.createRecipe` succeeds with `visibility: 'public'`                 | `utils/notify/index.ts:notifyFollowersOfNewRecipe` | `followed-user-posted.mjml` | `UserPreferences.followedUserPosted` |

The preference flags are exposed to users on the Settings page and persisted on `UserPreferences`.

## Trigger rules (deliberately conservative)

- **Like**: only on the _new like_ transition, never on un-like, never on self-like.
- **Comment**: never when the commenter is the recipe author (so the OP doesn't email themselves).
- **New public recipe**: only on `createRecipe`. Visibility flips on `updateRecipe` (private →
  public) do **not** fan out today; tracked as a follow-up so users aren't bombarded if a draft
  toggles repeatedly while being published.
- **All categories**: skipped entirely when `APP_ENV=test`.

## Delivery model

```
service action (e.g. follow created)
  │
  ├─ DB write (awaited — part of the response)
  │
  └─ (async () => notifyXxx(...))().catch(log)
                                       └─ never thrown to the caller
```

The IIFE is intentionally not awaited so that:

- a slow SMTP server doesn't slow the API response;
- a failing SMTP server doesn't fail the social action;
- a malformed template logs the error without taking down the request.

If meaningful drop rates appear in production, the next step is a queue with retries (see ADR-011
trade-offs).

## Templates

All templates live in `apps/api/src/templates/email/` as MJML, rendered server-side via the `mjml`
package. Variables are injected via simple `{{variable}}` substitution in
`utils/notify/index.ts:render`. Available variables vary per template — see each `.mjml` source.

The shared variables on every notification template:

| Variable       | Description              |
| -------------- | ------------------------ |
| `{{app_name}}` | Always `BrewForm`        |
| `{{username}}` | The recipient's username |

Action-specific variables (e.g. `{{recipe_title}}`, `{{follower_username}}`) are documented inline
in each template.

## Local testing

In development, Mailpit captures every outgoing email and exposes them at `http://localhost:8025`.
There's no production SMTP wiring required to exercise the full flow:

1. `make up` to start infrastructure, then `make dev` to start the development servers.
2. Trigger a social action (follow another user, like a recipe, etc.).
3. Open `http://localhost:8025` to inspect the rendered HTML.

In `APP_ENV=test`, the transport is short-circuited entirely — no Mailpit traffic, no log entries
beyond a single "skipped" line per send.

## Adding a new notification

1. Add a new MJML template to `apps/api/src/templates/email/`.
2. Add a new `notifyXxx({ ... })` helper to `apps/api/src/utils/notify/index.ts` that loads the
   template, renders, and calls `sendEmail` — copy-paste from an existing helper.
3. Decide whether the new category needs its own preference flag. If yes, add the column to
   `UserPreferences` (Prisma + migration), update the preference DTO in `@brewform/shared`, and gate
   the helper on the flag. If no (it's transactional like welcome/reset), invoke unconditionally.
4. Wire the helper into the originating service as a fire-and-forget IIFE — see existing call sites
   for the pattern.
