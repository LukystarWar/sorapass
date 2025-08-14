import { neon } from "@neondatabase/serverless";

let _sql: any | null = null;

export function getSql() {
  if (_sql) return _sql;
  
  // Tenta primeiro DATABASE_URL, depois NETLIFY_DATABASE_URL
  const url = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
  
  if (!url) {
    throw new Error("DATABASE_URL ou NETLIFY_DATABASE_URL é obrigatório");
  }
  
  _sql = neon(url);
  return _sql;
}