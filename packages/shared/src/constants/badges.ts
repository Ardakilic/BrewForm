export const BADGE_RULES = [
  {
    rule: 'first_brew',
    name: 'First Brew',
    icon: '\u2615',
    description: 'Logged your first recipe',
    threshold: 1,
  },
  {
    rule: 'decade_brewer',
    name: 'Decade Brewer',
    icon: '\u{1F51F}',
    description: '10 recipes logged',
    threshold: 10,
  },
  {
    rule: 'centurion',
    name: 'Centurion',
    icon: '\u{1F4AF}',
    description: '100 recipes logged',
    threshold: 100,
  },
  {
    rule: 'first_fork',
    name: 'First Fork',
    icon: '\u{1F374}',
    description: 'Forked your first recipe',
    threshold: 1,
  },
  {
    rule: 'fan_favourite',
    name: 'Fan Favourite',
    icon: '\u2B50',
    description: 'One of your recipes received 10+ likes',
    threshold: 10,
  },
  {
    rule: 'community_star',
    name: 'Community Star',
    icon: '\u{1F31F}',
    description: 'One of your recipes received 50+ likes',
    threshold: 50,
  },
  {
    rule: 'conversationalist',
    name: 'Conversationalist',
    icon: '\u{1F4AC}',
    description: 'Left 10+ comments',
    threshold: 10,
  },
  {
    rule: 'precision_brewer',
    name: 'Precision Brewer',
    icon: '\u{1F3AF}',
    description: 'Logged 10 recipes with all optional fields filled',
    threshold: 10,
  },
  {
    rule: 'explorer',
    name: 'Explorer',
    icon: '\u{1F30D}',
    description: 'Brewed with 5+ different brew methods',
    threshold: 5,
  },
  {
    rule: 'influencer',
    name: 'Influencer',
    icon: '\u{1F465}',
    description: 'Gained 25+ followers',
    threshold: 25,
  },
] as const;

/**
 * Machine-readable identifier for a badge rule.
 *
 * Derived from the `rule` field of {@link BADGE_RULES} so the union cannot
 * drift from the rule definitions. Consumed by Drizzle's `pgEnum()` and by
 * Zod `z.enum()` to keep the database enum, runtime validation, and
 * TypeScript union synchronised.
 */
export type BadgeRule = (typeof BADGE_RULES)[number]['rule'];

/**
 * Pure-values tuple of every {@link BadgeRule}.
 *
 * Derived from {@link BADGE_RULES} via `.map()` (the source field is `rule`,
 * not `value`). Consumed by Drizzle's `pgEnum()` and by Zod `z.enum()`.
 */
export const BADGE_RULE_VALUES = BADGE_RULES.map((b) => b.rule) as [BadgeRule, ...BadgeRule[]];
