## ADDED Requirements

### Requirement: Theme text tokens meet WCAG AA on the surfaces they are drawn on
Every text colour token in `apps/web/src/styles/globals.css` SHALL measure at least 4.5:1 against every surface it is allowed on, in the light, dark and coffee themes, and `apps/web/src/utils/chart/contrast.test.ts` SHALL lock the allowed pairs.

- `--text-primary` and `--text-secondary` are allowed on `--bg-primary`, `--bg-secondary` and
  `--bg-tertiary`. `--text-tertiary` is allowed only on `--bg-primary` and `--bg-secondary`; chips,
  popups, reply boxes and hover states on `--bg-tertiary` use `--text-secondary` as their lowest
  text level.
- `--accent-primary`, `--accent-secondary` and `--success` are allowed on `--bg-primary` and
  `--bg-secondary`; `--error` also on `--error-bg`, `--warning` also on `--warning-bg` (defined in
  all three themes); each `--diff-*-text` on its `--diff-*-bg` and `--accent-secondary` on
  `--diff-highlight`, composited over `--bg-primary` and `--bg-secondary`.
- Text on an accent or status fill (`--accent-primary`, `--accent-secondary`, `--error`,
  `--success`, `--warning`, `--text-secondary`) uses `var(--bg-primary)`; production `.tsx` SHALL
  NOT contain a `white`, `black`, `#fff` or `#000` colour literal or a `text-white`/`text-black`
  class, and no single element SHALL combine a `--bg-tertiary` background with a `--text-tertiary`
  text colour (both enforced by `apps/web/src/styles/theme-usage.test.ts`). Every `var(--…)`
  colour a component uses SHALL be defined in all three theme blocks.

#### Scenario: Token matrix passes in every theme
- **WHEN** the contrast unit test parses the light, dark and coffee blocks of `globals.css`
- **THEN** every allowed text/surface pair, every diff composite and every `--bg-primary`-on-fill pair is at least 4.5:1, and `--text-tertiary` on `--bg-secondary` measures about 4.73, 5.00 and 5.30

#### Scenario: Error banners are readable in dark mode
- **WHEN** an `ErrorState` banner renders in the dark theme
- **THEN** its text (`--error` on `--error-bg`) measures at least 4.5:1

#### Scenario: No literal white text on a gold fill
- **WHEN** the usage guard scans `apps/web/src/**/*.tsx`
- **THEN** it finds no `white`/`black` colour literal and no `text-white` class, and `TypeBadge`, `CategoryTabs` and the notification badge render their text in `var(--bg-primary)`

#### Scenario: Tertiary text stays off raised surfaces
- **WHEN** the usage guard scans the same files
- **THEN** no style object, class string or class array sets both a `--bg-tertiary` background and a `--text-tertiary` text colour
