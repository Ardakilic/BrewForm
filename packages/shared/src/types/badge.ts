/**
 * Badge type definitions shared between API and frontend.
 *
 * Badges are awarded to users automatically when they meet a rule's
 * threshold (e.g. brewing 100 recipes earns the "Centurion" badge).
 */

/** Machine-readable badge rule identifier. */
export type BadgeRule =
  | 'first_brew'
  | 'decade_brewer'
  | 'centurion'
  | 'first_fork'
  | 'fan_favourite'
  | 'community_star'
  | 'conversationalist'
  | 'precision_brewer'
  | 'explorer'
  | 'influencer';

/** Badge definition (platform-wide, not per-user). */
export interface Badge {
  /** UUID primary key */
  id: string;
  /** Display name (e.g. "Centurion") */
  name: string;
  /** Emoji icon */
  icon: string;
  /** Human-readable description of how to earn it */
  description: string;
  /** Rule that triggers awarding */
  rule: BadgeRule;
  /** Numeric threshold required to earn the badge */
  threshold: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Many-to-many join recording when a user earned a badge. */
export interface UserBadge {
  id: string;
  userId: string;
  badgeId: string;
  /** Timestamp when the badge was awarded */
  awardedAt: Date;
}
