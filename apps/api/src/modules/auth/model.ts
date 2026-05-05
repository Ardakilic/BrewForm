// deno-lint-ignore-file no-explicit-any require-await
import { prisma } from '@brewform/db';
import * as bcrypt from 'bcryptjs';
const hashSync = (bcrypt as any).hashSync || (bcrypt as any).default?.hashSync;
const compareSync = (bcrypt as any).compareSync || (bcrypt as any).default?.compareSync;

if (!hashSync) {
  throw new Error(
    'hashSync could not be resolved from bcrypt. Please install/require bcryptjs or correct the import so that hashSync is available.',
  );
}
if (!compareSync) {
  throw new Error(
    'compareSync could not be resolved from bcrypt. Please install/require bcryptjs or correct the import so that compareSync is available.',
  );
}

export async function findUserByEmail(email: string) {
  return prisma.user.findFirst({
    where: { email, deletedAt: null },
    include: { preferences: true },
  } as any);
}

export async function findUserByUsername(username: string) {
  return prisma.user.findFirst({
    where: { username, deletedAt: null },
  } as any);
}

export async function findUserById(id: string) {
  return prisma.user.findFirst({
    where: { id, deletedAt: null },
    include: { preferences: true },
  } as any);
}

export async function createUser(data: {
  email: string;
  username: string;
  password: string;
  displayName?: string;
}) {
  const passwordHash = hashSync(data.password, 10);
  return prisma.user.create({
    data: {
      email: data.email,
      username: data.username,
      passwordHash,
      displayName: data.displayName || null,
      preferences: {
        create: {},
      },
    },
    include: { preferences: true },
  } as any);
}

export function verifyPassword(plainPassword: string, hashedPassword: string): boolean {
  return compareSync(plainPassword, hashedPassword);
}

export async function updateUserPassword(userId: string, newPassword: string) {
  const passwordHash = hashSync(newPassword, 10);
  return prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  } as any);
}

export async function createPasswordReset(userId: string, token: string, expiresAt: Date) {
  return (prisma as any).passwordReset.create({
    data: { userId, token, expiresAt },
  });
}

export async function findPasswordResetByToken(token: string) {
  return (prisma as any).passwordReset.findUnique({
    where: { token },
    include: { user: true },
  });
}

export async function markPasswordResetUsed(id: string) {
  return (prisma as any).passwordReset.update({
    where: { id },
    data: { usedAt: new Date() },
  });
}

export async function markOnboardingComplete(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { onboardingCompleted: true },
  } as any);
}
