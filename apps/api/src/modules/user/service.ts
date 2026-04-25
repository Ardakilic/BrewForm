import * as model from './model.ts';

export async function getProfile(userId: string) {
  const user = await model.findById(userId);
  if (!user) throw new Error('USER_NOT_FOUND');
  // deno-lint-ignore no-explicit-any
  const { passwordHash: _passwordHash, ...safe } = user as any;
  const stats = await model.getUserStats(userId);
  return { ...safe, ...stats };
}

export async function getPublicProfile(username: string) {
  const user = await model.findByUsername(username);
  if (!user) throw new Error('USER_NOT_FOUND');
  // deno-lint-ignore no-explicit-any
  const { passwordHash: _passwordHash, email: _email, ...safe } = user as any;
  const stats = await model.getUserStats(user.id);
  return { ...safe, ...stats };
}

export async function updateProfile(userId: string, data: { displayName?: string; bio?: string; avatarUrl?: string }) {
  const user = await model.updateProfile(userId, data);
  // deno-lint-ignore no-explicit-any
  const { passwordHash: _passwordHash, ...safe } = user as any;
  return safe;
}

export async function deleteAccount(userId: string) {
  await model.deleteUser(userId);
}