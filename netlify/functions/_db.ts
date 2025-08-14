import { neon } from "@neondatabase/serverless";

let _sql: any | null = null;

export function getSql() {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is missing");
  _sql = neon(url); // exige Node 18+ (tem fetch global)
  return _sql;
}
