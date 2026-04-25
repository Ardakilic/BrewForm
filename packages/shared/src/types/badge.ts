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

export interface Badge {
  id: string;
  name: string;
  icon: string;
  description: string;
  rule: BadgeRule;
  threshold: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserBadge {
  id: string;
  userId: string;
  badgeId: string;
  awardedAt: Date;
}