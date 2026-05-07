import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.ts';

const rawConnectionString = Deno.env.get('DATABASE_URL')!;
// Strip Prisma-specific query params that postgres-js does not understand
const connectionUrl = new URL(rawConnectionString);
connectionUrl.searchParams.delete('connection_limit');
connectionUrl.searchParams.delete('pool_timeout');
const connectionString = connectionUrl.toString();
const client = postgres(connectionString, { max: 10 });
export const db = drizzle(client, { schema });
export { client };
