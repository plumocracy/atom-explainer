import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

export * from './schema.zod';

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

const pool = new Pool({
	connectionString: env.DATABASE_URL,
	max: Number.parseInt(env.POSTGRES_POOL_MAX ?? '10', 10),
	idleTimeoutMillis: 30_000,
	connectionTimeoutMillis: 10_000
});

export const db = drizzle(pool, { schema });
