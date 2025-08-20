export async function getSql() {
  const { neon } = await import("@neondatabase/serverless");
  const { NETLIFY_DATABASE_URL } = process.env;
  if (!NETLIFY_DATABASE_URL) throw new Error("Missing NETLIFY_DATABASE_URL");
  return neon(NETLIFY_DATABASE_URL);
}
