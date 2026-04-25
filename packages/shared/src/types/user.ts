export type Theme = 'light' | 'dark' | 'coffee';
export type UnitSystem = 'metric' | 'imperial';
export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';

export interface UserPreferences {
  unitSystem: UnitSystem;
  temperatureUnit: 'celsius' | 'fahrenheit';
  theme: Theme;
  locale: string;
  timezone: string;
  dateFormat: DateFormat;
  emailNotifications: {
    newFollower: boolean;
    recipeLiked: boolean;
    recipeCommented: boolean;
    followedUserPosted: boolean;
  };
}

export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  preferences: UserPreferences;
  onboardingCompleted: boolean;
  isAdmin: boolean;
  isBanned: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface UserProfile {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  publicRecipeCount: number;
  followerCount: number;
  followingCount: number;
  badges: Array<{ id: string; name: string; icon: string }>;
  featuredRecipes: Array<{
    id: string;
    slug: string;
    title: string;
    photoUrl: string | null;
    rating: number | null;
  }>;
  createdAt: Date;
}