export async function getSql() {
  const { neon } = await import("@neondatabase/serverless");
  const { DATABASE_URL } = process.env;
  if (!DATABASE_URL) throw new Error("Missing DATABASE_URL");
  return neon(DATABASE_URL);
}
