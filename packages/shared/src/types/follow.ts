/**
 * Follow-relationship type definition shared between API and frontend.
 */

/** Records a user following another user. */
export interface Follow {
  /** UUID primary key */
  id: string;
  /** User who initiated the follow */
  followerId: string;
  /** User being followed */
  followingId: string;
  createdAt: Date;
}
