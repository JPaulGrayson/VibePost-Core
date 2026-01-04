import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle, NeonDatabase } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

// Configure WebSocket for serverless environments
neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Pool configuration - longer idle timeout to prevent remote disconnects
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 60000, // 60 seconds idle timeout
  max: 10
};

// Keep-alive interval to prevent pool from being closed due to inactivity
let keepAliveInterval: NodeJS.Timeout | null = null;

function startKeepAlive() {
  if (keepAliveInterval) return;
  
  // Ping database every 30 seconds to keep connection alive
  keepAliveInterval = setInterval(async () => {
    try {
      const pool = getPool();
      if (pool && !(pool as any).ended) {
        await pool.query('SELECT 1');
      }
    } catch (err) {
      console.log('🔌 Keep-alive ping failed, pool will be recreated on next query');
      poolEnded = true;
    }
  }, 30000);
  
  console.log('💓 Database keep-alive started (30s interval)');
}

// Track pool state to prevent "Cannot use a pool after calling end" errors
let poolEnded = false;
let currentPool: Pool | null = null;
let currentDb: NeonDatabase<typeof schema> | null = null;

// Create or get the pool
function getPool(): Pool {
  // Check if pool needs recreation:
  // 1. No pool exists
  // 2. Pool was marked as ended by our code
  // 3. Pool was ended remotely/by idle timeout (check .ended property)
  const needsNewPool = !currentPool || poolEnded || (currentPool as any).ended;
  
  if (needsNewPool) {
    if (currentPool && !poolEnded) {
      console.log('🔌 Pool was closed remotely, recreating...');
    } else {
      console.log('🔌 Creating new database pool...');
    }
    
    poolEnded = false;
    currentPool = new Pool(poolConfig);

    // Handle pool errors gracefully
    currentPool.on('error', (err) => {
      console.error('⚠️ Database pool error (will attempt reconnect on next query):', err.message);
      // Mark pool as ended so next query creates a fresh pool
      poolEnded = true;
    });

    currentDb = drizzle({ client: currentPool, schema });
    console.log('✅ Database pool created successfully');
    
    // Start keep-alive to prevent idle disconnects
    startKeepAlive();
  }
  return currentPool!;
}

// Get the drizzle instance (ensures pool is valid)
function getDb(): NeonDatabase<typeof schema> {
  getPool(); // Ensure pool is created/recreated
  return currentDb!;
}

// Export pool getter for direct access when needed
export const pool = new Proxy({} as Pool, {
  get(_, prop) {
    const realPool = getPool();
    const value = (realPool as any)[prop];
    return typeof value === 'function' ? value.bind(realPool) : value;
  }
});

// Export db as a proxy that always uses a valid connection
export const db = new Proxy({} as NeonDatabase<typeof schema>, {
  get(_, prop) {
    const realDb = getDb();
    const value = (realDb as any)[prop];
    return typeof value === 'function' ? value.bind(realDb) : value;
  }
});

// Helper to safely close the pool (for graceful shutdown)
async function closePool() {
  if (currentPool && !poolEnded) {
    console.log('🔌 Closing database pool...');
    poolEnded = true;
    try {
      await currentPool.end();
      console.log('✅ Database pool closed');
    } catch (err) {
      console.error('⚠️ Error closing pool:', err);
    }
    currentPool = null;
    currentDb = null;
  }
}

// Graceful shutdown - only close pool, don't call process.exit
// Let the main process handle exit
let isShuttingDown = false;

process.on('SIGINT', async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('Received SIGINT, closing database pool...');
  await closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('Received SIGTERM, closing database pool...');
  await closePool();
  process.exit(0);
});