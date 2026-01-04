import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

// Neon requires SSL - add to connection string if not present
let connectionString = process.env.DATABASE_URL;
if (!connectionString.includes('sslmode=')) {
  connectionString += connectionString.includes('?') ? '&sslmode=require' : '?sslmode=require';
}

const pool = new Pool({
  connectionString,
  connectionTimeoutMillis: 15000, // 15 second timeout for Neon compute wakeup
  idleTimeoutMillis: 30000, // Release idle connections after 30s
  max: 5, // Reduced for pooler endpoint - stays within Neon limits
  allowExitOnIdle: false,
  application_name: 'vibepost' // For observability in Neon dashboard
});

// Log pool creation
console.log('🔌 Database pool created with TCP connection');

// Handle pool-level errors (e.g., from Neon auto-suspend)
pool.on('error', (err) => {
  console.error('⚠️ Pool error (connections will be recreated):', err.message);
});

// Keep-alive every 4 minutes to prevent Neon auto-suspend (5 min idle)
const keepAliveInterval = setInterval(async () => {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('💓 Keep-alive successful');
  } catch (err) {
    console.error('💔 Keep-alive failed:', (err as Error).message);
  }
}, 240000);

// Export drizzle instance
export const db = drizzle(pool, { schema });

// Export pool for direct access
export { pool };

// Graceful shutdown
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
