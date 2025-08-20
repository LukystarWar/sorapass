import type { Handler, HandlerResponse } from "@netlify/functions";

export const handler: Handler = async (): Promise<HandlerResponse> => {
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
    
    const games = await sql`
      SELECT app_id, name, cover_url
      FROM games 
      ORDER BY name
    `;

    if (!games.length) {
      return {
        statusCode: 404,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Nenhum jogo encontrado" })
      };
    }

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=1800"
      },
      body: JSON.stringify(games)
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ 
        error: err instanceof Error ? err.message : "Erro interno" 
      })
    };
  }
};