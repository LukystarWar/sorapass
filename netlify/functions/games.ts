import type { Handler, HandlerResponse } from "@netlify/functions";

export const handler: Handler = async (event): Promise<HandlerResponse> => {
  try {
    // Dynamic import para evitar conflito ESM/CJS
    const { neon } = await import("@neondatabase/serverless");
    const { NETLIFY_DATABASE_URL } = process.env;
    
    if (!NETLIFY_DATABASE_URL) {
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Missing NETLIFY_DATABASE_URL" })
      };
    }
    
    const sql = neon(NETLIFY_DATABASE_URL);
    const page = Math.max(1, Number(event.queryStringParameters?.page || 1));
    const per = Math.min(100, Number(event.queryStringParameters?.per || 50));
    const offset = (page - 1) * per;

    const rows = await sql/* sql */`
      SELECT 
        app_id, 
        name, 
        cover_url, 
        developer, 
        publisher, 
        release_year
      FROM games 
      ORDER BY name 
      LIMIT ${per} 
      OFFSET ${offset};
    `;

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=3600, stale-while-revalidate=86400"
      },
      body: JSON.stringify({ 
        page, 
        per, 
        results: rows 
      })
    };

  } catch (err) {
    console.error("games error:", err);
    return { 
      statusCode: 500, 
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "db error" })
    };
  }
};