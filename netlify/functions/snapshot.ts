import type { Handler, HandlerResponse } from "@netlify/functions";
import { getSql } from "./_db";

// Função para sanitizar strings
function sanitizeString(str: string): string {
  if (!str) return str;
  return str
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/[\uD800-\uDFFF]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
}

export const handler: Handler = async (): Promise<HandlerResponse> => {
  try {
    // 1) Tentar cache Blobs primeiro
    try {
      const { getStore } = await import("@netlify/blobs");
      const store = getStore("games");
      const data = await store.get("all.json");
      
      if (data) {
        return {
          statusCode: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "public, max-age=3600",
            "x-data-source": "blobs"
          },
          body: data
        };
      }
    } catch (error) {
      console.log("Cache não disponível, usando banco...");
    }

    // 2) Fallback para banco de dados
    const sql = getSql();
    
    const games = await sql`
      SELECT app_id, name, cover_url, developer, publisher, release_year
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

    // Sanitizar dados
    const sanitizedGames = games.map((game: any) => ({
      ...game,
      name: sanitizeString(game.name),
      developer: game.developer ? sanitizeString(game.developer) : null,
      publisher: game.publisher ? sanitizeString(game.publisher) : null
    }));

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=1800",
        "x-data-source": "database"
      },
      body: JSON.stringify(sanitizedGames)
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