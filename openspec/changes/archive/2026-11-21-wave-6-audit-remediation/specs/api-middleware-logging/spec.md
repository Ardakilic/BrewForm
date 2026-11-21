## MODIFIED Requirements

### Requirement: Rate limit middleware logs exceeded limits

The rate limit middleware SHALL emit a warn log with the policy id, the configured limit and the user ID (if authenticated) when a request is rejected by a rate-limit policy. The client IP, any email address and the limiter store key are used only to derive the rate-limit key and SHALL NOT be included in the log context (see the `api-rate-limiting` capability). The log message and logger name SHALL stay `rateLimitMiddleware rate limit exceeded` and `rate-limit-middleware`.

#### Scenario: IP-keyed policy exceeded is logged

- **WHEN** an unauthenticated client exceeds the `global` policy
- **THEN** the system SHALL emit `log.warn({ policy: 'global', limit: 100 }, 'rateLimitMiddleware rate limit exceeded')`
- **AND** return a 429 response unchanged

#### Scenario: User-keyed policy exceeded is logged

- **WHEN** an authenticated client exceeds a user-keyed policy such as `comment-user`
- **THEN** the system SHALL emit `log.warn({ policy: 'comment-user', limit: 5, userId: "<user-id>" }, 'rateLimitMiddleware rate limit exceeded')`
- **AND** return a 429 response unchanged
