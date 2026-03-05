import pg from "pg";
import { getDbUrl } from "../config.ts";

let pool: pg.Pool | null = null;

export async function getPool(): Promise<pg.Pool> {
  if (pool) return pool;

  const connectionString = await getDbUrl();
  const isLocalTunnel = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");
  pool = new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    // Skip SSL for local SSM tunnel; use permissive SSL for direct RDS connections
    ssl: isLocalTunnel ? false : { rejectUnauthorized: false },
  });

  pool.on("error", (err) => {
    console.error("[DB Pool] Connection error — resetting pool:", err.message);
    resetPool();
  });

  return pool;
}

/** Destroy the pool so next query creates a fresh connection */
export function resetPool(): void {
  if (pool) {
    pool.end().catch(() => {});
    pool = null;
  }
}

const CONNECTION_ERROR_RE =
  /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|connection terminated|Connection terminated|cannot connect|too many clients|timeout expired/i;

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  const p = await getPool();
  try {
    return await p.query<T>(text, params);
  } catch (err) {
    // If it's a connection error, reset pool so next request retries fresh
    const msg = err instanceof Error ? err.message : "";
    if (CONNECTION_ERROR_RE.test(msg)) {
      console.error("[DB Pool] Query connection error — resetting pool for recovery");
      resetPool();
    }
    throw err;
  }
}

/** Quick connectivity check — returns true if DB is reachable */
export async function checkDbConnection(): Promise<boolean> {
  try {
    const p = await getPool();
    await p.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
