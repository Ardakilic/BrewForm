/**
 * Named rate-limit policies (api-rate-limiting spec, "Rate limits are expressed
 * as named policies with isolated counters").
 *
 * Every limit in the API is one entry of {@link POLICIES}. Each policy counts
 * in its own key namespace `<policy-id>:<key>` (`brewform-rl:` prefix on
 * Redis), so no two policies or routes share a counter. Mount order on a route:
 * IP-keyed policies before body validation and auth, email-keyed policies after
 * `zValidator`, user-keyed policies after `authMiddleware`.
 */
import { config } from '../../config/index.ts';

/** What a policy keys its counter on. */
export type RateLimitDimension = 'ip' | 'email' | 'email-ip' | 'user';

/**
 * `count` consumes a point on every request; `failures` reserves a point with
 * an atomic `consume` before the handler and keeps it only after a failed
 * attempt, giving it back otherwise (see `rateLimitFailures`).
 */
export type RateLimitMode = 'count' | 'failures';

/** One named rate limit. */
export interface RateLimitPolicy {
  /** Stable id, used as the key namespace, in headers and in logs. */
  readonly id: string;
  /** What the counter is keyed on. */
  readonly dimension: RateLimitDimension;
  /** Allowed points (requests or failures) per window. */
  readonly points: number;
  /** Window length in seconds. */
  readonly durationSec: number;
  /** Counting mode. */
  readonly mode: RateLimitMode;
  /** The 429 `error.message` for this policy. */
  readonly message: string;
}

const GENERIC = 'Too many requests, please try again later';
const LOGIN = 'Too many login attempts, please try again later';
const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Define one frozen policy.
 *
 * @param policy - The policy fields.
 * @returns The same policy, frozen.
 */
function policy(policy: RateLimitPolicy): RateLimitPolicy {
  return Object.freeze(policy);
}

/**
 * The policy table from the `api-rate-limiting` spec. `global` reads
 * `RATE_LIMIT_GLOBAL_MAX` (default 100) when this module is first imported.
 */
export const POLICIES = Object.freeze({
  global: policy({
    id: 'global',
    dimension: 'ip',
    points: config.RATE_LIMIT_GLOBAL_MAX,
    durationSec: MINUTE,
    mode: 'count',
    message: GENERIC,
  }),
  uploads: policy({
    id: 'uploads',
    dimension: 'ip',
    points: 600,
    durationSec: MINUTE,
    mode: 'count',
    message: GENERIC,
  }),
  authLoginIp: policy({
    id: 'auth-login-ip',
    dimension: 'ip',
    points: 20,
    durationSec: 15 * MINUTE,
    mode: 'count',
    message: LOGIN,
  }),
  authLoginFailIp: policy({
    id: 'auth-login-fail-ip',
    dimension: 'ip',
    points: 100,
    durationSec: DAY,
    mode: 'failures',
    message: LOGIN,
  }),
  authLoginFailAccountIp: policy({
    id: 'auth-login-fail-account-ip',
    dimension: 'email-ip',
    points: 5,
    durationSec: 15 * MINUTE,
    mode: 'failures',
    message: LOGIN,
  }),
  authLoginFailAccount: policy({
    id: 'auth-login-fail-account',
    dimension: 'email',
    points: 20,
    durationSec: HOUR,
    mode: 'failures',
    message: LOGIN,
  }),
  authRegisterIp: policy({
    id: 'auth-register-ip',
    dimension: 'ip',
    points: 5,
    durationSec: HOUR,
    mode: 'count',
    message: 'Too many registration attempts, please try again later',
  }),
  authForgotIp: policy({
    id: 'auth-forgot-ip',
    dimension: 'ip',
    points: 5,
    durationSec: 15 * MINUTE,
    mode: 'count',
    message: 'Too many password reset requests, please try again later',
  }),
  authForgotAccount: policy({
    id: 'auth-forgot-account',
    dimension: 'email',
    points: 3,
    durationSec: HOUR,
    mode: 'count',
    message: 'Too many password reset requests, please try again later',
  }),
  authTokenIp: policy({
    id: 'auth-token-ip',
    dimension: 'ip',
    points: 10,
    durationSec: 15 * MINUTE,
    mode: 'count',
    message: 'Too many token attempts, please try again later',
  }),
  authVerifySendIp: policy({
    id: 'auth-verify-send-ip',
    dimension: 'ip',
    points: 10,
    durationSec: HOUR,
    mode: 'count',
    message: 'Too many verification emails requested, please try again later',
  }),
  authVerifySendUserBurst: policy({
    id: 'auth-verify-send-user-burst',
    dimension: 'user',
    points: 1,
    durationSec: MINUTE,
    mode: 'count',
    message: 'Too many verification emails requested, please try again later',
  }),
  authVerifySendUserDaily: policy({
    id: 'auth-verify-send-user-daily',
    dimension: 'user',
    points: 5,
    durationSec: DAY,
    mode: 'count',
    message: 'Too many verification emails requested, please try again later',
  }),
  contactIp: policy({
    id: 'contact-ip',
    dimension: 'ip',
    points: 3,
    durationSec: 15 * MINUTE,
    mode: 'count',
    message: 'Too many contact messages, please try again later',
  }),
  commentIp: policy({
    id: 'comment-ip',
    dimension: 'ip',
    points: 5,
    durationSec: MINUTE,
    mode: 'count',
    message: 'Too many comments, please try again later',
  }),
  commentUser: policy({
    id: 'comment-user',
    dimension: 'user',
    points: 5,
    durationSec: MINUTE,
    mode: 'count',
    message: 'Too many comments, please try again later',
  }),
  reportIp: policy({
    id: 'report-ip',
    dimension: 'ip',
    points: 3,
    durationSec: 15 * MINUTE,
    mode: 'count',
    message: 'Too many reports, please try again later',
  }),
  reportUser: policy({
    id: 'report-user',
    dimension: 'user',
    points: 3,
    durationSec: 15 * MINUTE,
    mode: 'count',
    message: 'Too many reports, please try again later',
  }),
} as const satisfies Record<string, RateLimitPolicy>);
