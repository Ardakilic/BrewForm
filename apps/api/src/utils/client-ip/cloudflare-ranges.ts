/**
 * Cloudflare's published edge IP ranges, used by `TRUST_PROXY=cloudflare` to
 * decide whether a `CF-Connecting-IP` header can be trusted (it is honoured
 * only when the selected hop is a Cloudflare edge, so a client talking to the
 * origin directly cannot forge it).
 *
 * Source: https://www.cloudflare.com/ips-v4 and https://www.cloudflare.com/ips-v6
 * (index: https://www.cloudflare.com/ips/). Fetched 2026-11-21. Cloudflare
 * changes these rarely; refresh both lists from the URLs above when it does.
 * Extra edges (another CDN, an internal proxy subnet) go in `TRUST_PROXY_CIDRS`.
 */

/** Cloudflare IPv4 edge ranges (https://www.cloudflare.com/ips-v4, fetched 2026-11-21). */
export const CLOUDFLARE_IPV4: readonly string[] = Object.freeze([
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
]);

/** Cloudflare IPv6 edge ranges (https://www.cloudflare.com/ips-v6, fetched 2026-11-21). */
export const CLOUDFLARE_IPV6: readonly string[] = Object.freeze([
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
]);
