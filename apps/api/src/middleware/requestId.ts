import { requestId } from 'hono/request-id';

export const requestIdMiddleware = requestId({
  headerName: 'X-Request-ID',
});