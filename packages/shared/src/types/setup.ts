/**
 * Setup type definition shared between API and frontend.
 *
 * A setup is a saved collection of equipment that a user can reuse
 * across recipes (e.g. "My morning espresso rig").
 */

export interface Setup {
  /** UUID primary key */
  id: string;
  /** Display name (e.g. "Home espresso station") */
  name: string;
  /** Owner */
  userId: string;
  /** Free-text brewer description */
  brewerDetails: string | null;
  /** Grinder make/model */
  grinder: string | null;
  /** FK to the portafilter equipment */
  portafilterId: string | null;
  /** FK to the basket equipment */
  basketId: string | null;
  /** FK to the puck screen equipment */
  puckScreenId: string | null;
  /** FK to the paper filter equipment */
  paperFilterId: string | null;
  /** FK to the tamper equipment */
  tamperId: string | null;
  /** Whether this is the user's default setup */
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
