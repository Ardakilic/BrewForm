import * as model from './model.ts';
import * as recipeModel from '../recipe/model.ts';
import { createLogger } from '../../utils/logger/index.ts';

const logger = createLogger('follow-service');

export async function followUser(followerId: string, followingId: string) {
  if (followerId === followingId) throw new Error('CANNOT_FOLLOW_SELF');
  const alreadyFollowing = await model.isFollowing(followerId, followingId);
  if (alreadyFollowing) throw new Error('ALREADY_FOLLOWING');
  return model.createFollow(followerId, followingId);
}

export async function unfollowUser(followerId: string, followingId: string) {
  await model.deleteFollow(followerId, followingId);
}

export async function getFollowers(userId: string, page: number, perPage: number) {
  return model.getFollowers(userId, page, perPage);
}

export async function getFollowing(userId: string, page: number, perPage: number) {
  return model.getFollowing(userId, page, perPage);
}

export async function getFeed(userId: string, page: number, perPage: number) {
  const followingIds = await model.getFollowingIds(userId);
  if (followingIds.length === 0) {
    return { recipes: [], total: 0 };
  }
  return recipeModel.getFeed(followingIds, page, perPage);
}