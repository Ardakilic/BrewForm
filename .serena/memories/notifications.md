## Delivery Model (Fire-and-Forget)

```
service action → DB write (awaited)
              → (async () => notifyXxx(...))().catch(log)   ← not awaited
```

Intentionally not awaited so SMTP failures never fail the originating action. Caught rejections logged for observability.

## Categories & Trigger Rules

| Category | Trigger | Preference Flag | Rule |
|----------|---------|-----------------|------|
| Welcome | registration | always sent | — |
| Password reset | forgot-password success | always sent | — |
| New follower | followUser succeeds | `newFollower` | — |
| Recipe liked | toggleLike → liked:true | `recipeLiked` | Never on self-like, never on un-like |
| Recipe commented | createComment succeeds | `recipeCommented` | Never when commenter is recipe author |
| Followed user posted | createRecipe with visibility:public | `followedUserPosted` | Only on create, NOT on visibility flip draft→public |

## Conservative Trigger Rules

- Like: only on new like transition, never un-like, never self-like.
- Comment: never if commenter is recipe author (OP doesn't email themselves).
- New public recipe: only on `createRecipe` — visibility flips (private→public) do NOT fan out.
- All skipped when `APP_ENV=test`.

## Templates

MJML in `apps/api/src/templates/email/`, compiled at build via `make email-build`. Variables injected via `{{variable}}` substitution. Every template gets `{{app_name}}` (BrewForm) and `{{username}}` (recipient). Context-specific vars documented per `.mjml` source.

## Local Testing

`make up` → Mailpit at `http://localhost:8025`. No production SMTP needed. In `APP_ENV=test`, transport short-circuited entirely.

## Adding a New Notification

1. Add `.mjml` template
2. Add `notifyXxx({...})` helper in `apps/api/src/utils/notify/index.ts`
3. If transactional → invoke unconditionally. If preference-gated → add column to `UserPreferences` + DTO + schema + gate the helper
4. Wire into service as fire-and-forget IIFE
