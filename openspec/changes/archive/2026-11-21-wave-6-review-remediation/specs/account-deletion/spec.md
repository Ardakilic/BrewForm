## ADDED Requirements

### Requirement: A deleted account has no public identity

Every non-admin API response that shows a user as the author or owner of a comment, recipe or collection SHALL carry `null` in place of that user's projection (`id`, `username`, `displayName`, `avatarUrl`) when the account is soft-deleted, and the web SHALL render such an author as "Deleted user" (`common.deletedUser`) without a profile link.

The content itself stays: the account's comments stay listed and counted, and its recipes and
collections keep their visibility (the privacy page: "Public recipes and comments may be
anonymized rather than deleted"). The models derive this from `users.deletedAt`: SQL-builder
joins put `isNull(users.deletedAt)` into the join condition (the comment `findById`, the recipe
list page), and relational loads select `deletedAt` and map the projection with
`utils/public-identity#visibleIdentity` (comment list and replies, recipe detail and cursor list,
collection detail, items and public browse, equipment and coffee-variety recipe lists). The
`author` recipe filter matches only live accounts. `createComment` never prepends a deleted
account's `@username`. Notifications and follow lists already exclude deleted accounts. Admin
endpoints keep the identity for moderation. A cached collection response can still show the
identity until its cache TTL expires (at most 10 minutes). Releasing the account's email and
username and clearing its stored profile data are not part of this requirement (D99.26).

#### Scenario: Comment by a deleted account

- **WHEN** user U commented on a public recipe and then deleted the account
- **THEN** `GET /api/v1/comments/recipe/:recipeId` returns U's comment with its content and `author: null`, and the recipe page shows "Deleted user" without a link to `/u/<username>`

#### Scenario: Reply to a deleted account's reply

- **WHEN** the recipe author replies to a reply written by a deleted account
- **THEN** the stored reply carries no `@username` prefix

#### Scenario: Recipe of a deleted account

- **WHEN** U published a public recipe and then deleted the account
- **THEN** the recipe stays in `GET /api/v1/recipes` and opens at its slug, both with `author: null`; the cards and the detail page show "Deleted user"; and the crawler description names "BrewForm user"

#### Scenario: Collection of a deleted account

- **WHEN** U owned a public collection and then deleted the account
- **THEN** the public collections list and the collection detail return `author: null` and show "Deleted user" without a link

#### Scenario: Author filter ignores deleted accounts

- **WHEN** a visitor filters recipes by the deleted account's username
- **THEN** none of that account's recipes are returned

#### Scenario: Admin still sees the owner

- **WHEN** an admin lists recipes in the admin panel
- **THEN** a recipe of a deleted account still shows that account's username

## MODIFIED Requirements

### Requirement: Post-deletion auth cleanup and redirect

When a user successfully deletes their account via the Settings page, the application SHALL
sign out through the shared `useSignOut()` hook (capability `web-data-loading`, "Signing out leaves
no private data on screen"), which clears the session cookies, navigates with `replace` to the home
page (`/`), and only after that navigation settles clears the local auth state
(`AuthContext.user` set to `null`). The server logout MUST happen before the navigation, so the
home page loader never runs with the deleted account's session, and the user MUST be cleared only
after it, so the `RequireAuth` guard on `/settings` never redirects to `/login?next=%2Fsettings`.

`AuthContext.logout(leave)` SHALL be used for auth cleanup, with the navigation as `leave`. Even
though its internal `authApi.logout()` call will likely fail against an already-deleted account's
session, the function still runs `leave` and then unconditionally calls `setUser(null)` after
catching any errors, which is the critical side effect.

The redirect target SHALL be `/` (the public home page), not `/login`. The home page is public
and does not require authentication, so there is no redirect loop risk.

#### Scenario: Successful deletion logs out and redirects

- **GIVEN** a logged-in user on `/settings`
- **WHEN** the user clicks "Delete Account", confirms the browser dialog, and `DELETE
  /users/me` returns 200
- **THEN** the browser navigates to `/` (never to `/login?next=%2Fsettings`)
- **AND** `AuthContext.user` is set to `null` after that navigation
- **AND** the navbar shows Login/Sign Up links (not the user's avatar)
- **AND** visiting `/settings` again redirects to `/login` (via `RequireAuth`)

#### Scenario: Cancel dialog does nothing

- **GIVEN** a logged-in user on `/settings`
- **WHEN** the user clicks "Delete Account" and then cancels the `confirm()` dialog
- **THEN** no API call is made, auth state is unchanged, and the user stays on `/settings`

#### Scenario: Pre-existing message is cleared before deletion

- **GIVEN** a user who previously saved preferences and sees a "Preferences saved!" (or "Failed
  to save preferences.") banner
- **WHEN** the user initiates account deletion (clicks the button, before confirmation)
- **THEN** the banner is cleared (`setMessage('')` and `setMessageType(null)`)
