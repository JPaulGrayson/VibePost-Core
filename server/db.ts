import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 0,
  max: 10
});

pool.on('error', (err) => {
  console.error('⚠️ Idle client error (pool will recreate on next query):', err.message);
});

const keepAliveInterval = setInterval(async () => {
  try {
    await pool.query('SELECT 1');
    console.log('💓 Keep-alive ping successful');
  } catch (err) {
    console.error('💔 Keep-alive ping failed:', (err as Error).message);
  }
}, 240000);

export const db = drizzle(pool, { schema });

export { pool };

let isShuttingDown = false;

process.on('SIGINT', async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('Received SIGINT, closing database pool...');
  clearInterval(keepAliveInterval);
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('Received SIGTERM, closing database pool...');
  clearInterval(keepAliveInterval);
  await pool.end();
  process.exit(0);
});
