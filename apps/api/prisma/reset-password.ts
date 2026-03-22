/**
 * BrewForm Password Reset CLI
 * Resets a user's password by email or username
 *
 * Usage:
 *   make reset-password USER=<email-or-username>
 *   make reset-password USER=<email-or-username> PASSWORD=<new-password>
 *
 * Examples:
 *   make reset-password USER=admin@brewform.local
 *   make reset-password USER=admin PASSWORD=MySecurePassword123!
 *
 * If no password is provided, a secure random password will be generated.
 */

import process from 'node:process';
import { PrismaClient } from './generated/prisma';
import { resetUserPassword } from '../src/modules/auth/cli.js';

const prisma = new PrismaClient();

/**
 * Reset user password and print results
 */
async function resetPassword(identifier: string, newPassword?: string): Promise<void> {
  const result = await resetUserPassword(prisma, identifier, newPassword);

  if (!result.success) {
    console.error(`❌ ${result.error}`);
    if (result.error?.includes('User not found')) {
      console.error('   Please provide a valid email or username.');
    }
    process.exit(1);
  }

  const { user, password } = result;

  console.log('\n🔐 Password reset successful!\n');
  console.log('User details:');
  console.log(`   Email:    ${user!.email}`);
  console.log(`   Username: ${user!.username}`);
  console.log(`   Display:  ${user!.displayName || user!.username}`);
  console.log(`   Admin:    ${user!.isAdmin ? 'Yes' : 'No'}`);
  console.log('');
  
  if (password) {
    console.log('New password (generated):');
    console.log(`   ${password}`);
    console.log('');
    console.log('⚠️  Please save this password - it will not be shown again!');
  } else {
    console.log('Password has been updated to the provided value.');
  }
  
  console.log('');
  console.log('ℹ️  All existing sessions have been invalidated.');
  console.log('   The user will need to log in again.\n');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
BrewForm Password Reset CLI

Usage:
  make reset-password USER=<email-or-username>
  make reset-password USER=<email-or-username> PASSWORD=<new-password>

Arguments:
  USER      User's email address or username
  PASSWORD  Optional. If not provided, a secure password will be generated.

Examples:
  # Reset admin password (generates new password)
  make reset-password USER=admin@brewform.local

  # Reset by username with specific password
  make reset-password USER=admin PASSWORD=MySecurePassword123!
`);
    process.exit(0);
  }

  const identifier = args[0];
  const newPassword = args[1];

  if (newPassword && newPassword.length < 8) {
    console.error('❌ Password must be at least 8 characters long.');
    process.exit(1);
  }

  await resetPassword(identifier, newPassword);
}

main()
  .catch((e) => {
    console.error('❌ Password reset failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

