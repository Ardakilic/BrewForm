import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.ts';

const connectionString = Deno.env.get('DATABASE_URL')!;
/** Raw postgres-js connection client (pool max 10). */
const client = postgres(connectionString, { max: 10 });
/** Drizzle ORM instance bound to the full BrewForm schema. */
export const db = drizzle(client, { schema });
export { client };
