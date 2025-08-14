import type { Handler, HandlerResponse } from "@netlify/functions";
import { getSql } from "./_db";

export const handler: Handler = async (): Promise<HandlerResponse> => {
  try {
    // 1) Tentar Blobs primeiro (mais rápido)
    try {
      const { getStore } = await import("@netlify/blobs");
      const store = getStore("games");
      const data = await store.get("all.json");
      
      if (data) {
        console.log("✅ Retornando snapshot do Blobs");
        return {
          statusCode: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
            "x-data-source": "blobs"
          },
          body: data
        };
      }
    } catch (error) {
      console.log("⚠️ Blobs não disponível, tentando DB...");
    }

    // 2) Fallback para banco de dados
    console.log("📚 Gerando snapshot do banco de dados...");
    const sql = getSql();
    
    const games = await sql/* sql */`
      SELECT 
        g.app_id,
        g.name,
        g.cover_url,
        g.developer,
        g.publisher,
        g.release_year,
        COALESCE(
          json_agg(gn.name) FILTER (WHERE gn.name IS NOT NULL),
          '[]'
        ) AS genres
      FROM games g
      LEFT JOIN game_genres gg ON gg.app_id = g.app_id
      LEFT JOIN genres gn ON gn.id = gg.genre_id
      GROUP BY g.app_id, g.name, g.cover_url, g.developer, g.publisher, g.release_year
      ORDER BY g.name;
    `;

    if (!games.length) {
      return {
        statusCode: 404,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "No games found" })
      };
    }

    console.log(`✅ Retornando ${games.length} jogos do banco`);

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=1800, stale-while-revalidate=3600", // Cache menor para DB
        "x-data-source": "database"
      },
      body: JSON.stringify(games)
    };

  } catch (err) {
    console.error("💥 Erro no snapshot:", err);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ 
        error: "snapshot error", 
        message: err instanceof Error ? err.message : String(err) 
      })
    };
  }
};