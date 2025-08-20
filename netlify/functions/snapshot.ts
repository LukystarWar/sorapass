import type { Handler, HandlerResponse } from "@netlify/functions";
import { getSql } from "./_db";

export const handler: Handler = async (): Promise<HandlerResponse> => {
  try {
    const sql = getSql();
    
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