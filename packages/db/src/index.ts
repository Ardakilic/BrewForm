import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.ts';

const connectionString = Deno.env.get('DATABASE_URL')!;
const client = postgres(connectionString, { max: 10 });
export const db = drizzle(client, { schema });
export { client };
