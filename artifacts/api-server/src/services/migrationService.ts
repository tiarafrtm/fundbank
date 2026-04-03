import { Pool } from "pg";
import { logger } from "../lib/logger";

export async function runMigrations(): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL ?? "";
  const dbPassword = process.env.SUPABASE_DB_PASSWORD ?? "";

  // Ekstrak project ref dari URL: https://{ref}.supabase.co
  const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
  if (!match || !dbPassword) {
    logger.warn("SUPABASE_DB_PASSWORD atau SUPABASE_URL tidak tersedia — migration dilewati");
    return;
  }
  const projectRef = match[1];
  const connectionString = `postgres://postgres:${dbPassword}@db.${projectRef}.supabase.co:5432/postgres`;

  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });

  const migrations = [
    {
      name: "add_antrian_keperluan",
      sql: `ALTER TABLE public.antrian ADD COLUMN IF NOT EXISTS keperluan TEXT;`,
    },
  ];

  try {
    const client = await pool.connect();
    try {
      for (const m of migrations) {
        await client.query(m.sql);
        logger.info({ migration: m.name }, "Migration dijalankan");
      }
    } finally {
      client.release();
    }
  } catch (err) {
    logger.warn({ err }, "Migration gagal — mungkin kolom sudah ada atau koneksi DB langsung tidak tersedia");
  } finally {
    await pool.end();
  }
}
