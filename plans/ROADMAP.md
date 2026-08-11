# Roadmap

> Living index of remaining work. Per-item detail lives in the source-of-truth files —
> [`TECHNICAL_DEBT.md`](TECHNICAL_DEBT.md) for resolved history, [`D99-debts.md`](D99-debts.md)
> for deferred debt, [`FEATURE_SUGGESTIONS.md`](FEATURE_SUGGESTIONS.md) for the feature backlog
> with per-plan PRDs. Update this file ONLY when an item's status changes; do NOT duplicate
> problem/fix detail here.

**Legend:** `P0` critical · `P1` correctness/security · `P2` structural · `P3` polish · `P4` deferred.

---

## Remaining Debt

All ledgered debt (D01–D43, D99.1–.19) is **resolved** — see
[`TECHNICAL_DEBT.md`](TECHNICAL_DEBT.md). Wave-5 closeout (manual walk + archive) completed
2026-07-28.

---

## Feature Backlog

Status reflects each F-plan's 2026-07-13 validation verdict.

| Priority | Feature | Effort | Impact | Status | PRD |
|----------|---------|--------|--------|--------|-----|
| **P0** | @Mention notifications (F04) | Low | High | ✅ Shipped (2026-07-13) | [`F04`](F04-mention-notifications.md) |
| **P0** | Recipe collections (F01) | Medium | High | ✅ Shipped (2026-07-09) | [`F01`](F01-recipe-collections.md) |
| **P0** | Recipe comparison improvements (F08) | Medium | High | ✅ Shipped (2026-07-28) | [`F08`](F08-recipe-comparison-improvements.md) |
| **P0** | Recipe version diff (F09) | Medium | High | ✅ Shipped (2026-07-28) | [`F09`](F09-version-diff.md) |
| **P1** | In-app notification center (F05) | High | High | ✅ Shipped (2026-08-02) | [`F05`](F05-in-app-notifications.md) |
| **P1** | Advanced search w/ facets (F11) | Medium | High | ✅ Shipped (2026-08-02) | [`F11`](F11-advanced-search.md) |
| **P1** | Image optimisation (F23) | Medium | Medium | 🔧 Rough — needs design decisions | [`F23`](F23-image-optimisation.md) |
| **P2** | Brew journal / "brew again" (F02) | Medium | Medium | ⚠️ Outdated — unblocks F03 / F20 / F25-sync | [`F02`](F02-brew-journal.md) |
| **P2** | Recipe templates (F06) | Low | Medium | ⚠️ Outdated | [`F06`](F06-recipe-templates.md) |
| **P2** | Batch/scale calculator (F07) | Low | Medium | ⚠️ Outdated — minor corrections | [`F07`](F07-batch-calculator.md) |
| **P2** | Similar recipes (F12) | Medium | Medium | ⚠️ Outdated | [`F12`](F12-similar-recipes.md) |
| **P2** | Equipment reviews/ratings (F27) | Medium | Medium | ✅ Valid | [`F27`](F27-equipment-reviews.md) |
| **P3** | Brew method landing pages (F14) | Medium | Low | 🔧 Rough — SEO stack undecided | [`F14`](F14-brew-method-pages.md) |
| **P3** | Recipe export/import (F10) | Medium | Medium | ⚠️ Outdated | [`F10`](F10-recipe-export-import.md) |
| **P3** | Admin analytics (F17) | Medium | Low | ⚠️ Outdated | [`F17`](F17-admin-analytics.md) |
| **P3** | PWA / offline (F25) | High | Medium | ⚠️ Outdated — PWA shell valid; brew-log sync blocked on F02 | [`F25`](F25-pwa-offline.md) |
| **P3** | Public API v2 (F21) | High | Medium | ✅ Valid | [`F21`](F21-public-api.md) |

**Not in matrix (2026-07-13 re-validation):**

- ❌ Invalid / blocked: F03 (blocked by F02), F20 (blocked by F02), F26
- ⚠️ Outdated (refresh plan before pickup): F13, F15, F16, F18, F19
- ✅ Shipped (2026-07-28): F08 (recipe comparison improvements — diff highlighting + merge endpoint)
- 🔧 Rough: F22 webhooks
- ✅ Valid (ready to spec): F24 version snapshots, F28 guided brew mode, F29 weekly email digest, F30 bean freshness tracking, F31 recipe embed widgets

---

## Next candidates

Per the 2026-07-13 priority matrix refresh (updated 2026-08-02):

1. **F02** (P2) — unblocks F03, F20, and F25's brew-log sync; high leverage despite P2.

**Optional quick wins** (no plan refresh needed):

- Any ✅ Valid feature: F21, F24, F27, F28, F29, F30, F31.

---

## History

- **Waves 0–4** (2026-07-05 → 2026-07-07): all ledgered D-items resolved. See
  [`TECHNICAL_DEBT.md`](TECHNICAL_DEBT.md) for the per-item resolution log.
- **Wave 5** (2026-07-27): resolved D99.1, .3, .5, .6, .7, .9, .10–.16, .19 via the
  `wave-5-debt-clearance` OpenSpec change. D99.8, .17, .18 remain deferred by design.
- **Remaining debt clearance** (2026-07-27): resolved D99.4, .8, .17, .18 via the
  `remaining-debt-clearance` OpenSpec change. The D99 ledger is now fully closed.
- **Features shipped:** F01 (recipe collections, 2026-07-09), F04 (mention notifications,
  2026-07-13), F08 (recipe comparison improvements, 2026-07-28), F09 (recipe version diff,
  2026-07-28), F05 (in-app notification center, 2026-08-02), F11 (advanced search, 2026-08-02).
