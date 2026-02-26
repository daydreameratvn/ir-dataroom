import pg from "pg";
import { getDbUrl } from "../config.ts";

let pool: pg.Pool | null = null;

export async function getPool(): Promise<pg.Pool> {
  if (pool) return pool;

  const connectionString = await getDbUrl();
  pool = new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    // RDS uses Amazon-issued certificates; accept them without bundling the CA
    ssl: { rejectUnauthorized: false },
  });

  pool.on("error", (err) => {
    console.error("Unexpected pool error:", err);
  });

  return pool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  const p = await getPool();
  return p.query<T>(text, params);
}
