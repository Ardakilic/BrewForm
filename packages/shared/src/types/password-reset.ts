/**
 * Password-reset type definition shared between API and frontend.
 */

/** Tracks a password-reset request and its one-time token. */
export interface PasswordReset {
  /** UUID primary key */
  id: string;
  /** FK to the user requesting the reset */
  userId: string;
  /** One-time reset token sent via email */
  token: string;
  /** Token expiry timestamp */
  expiresAt: Date;
  /** When the token was consumed (null if unused) */
  usedAt: Date | null;
  createdAt: Date;
}
