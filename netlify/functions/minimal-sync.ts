import type { Handler, HandlerResponse } from "@netlify/functions";
import { getSql } from "./_db";

export const handler: Handler = async (): Promise<HandlerResponse> => {
  try {
    const key = process.env.STEAM_API_KEY;
    const ids = process.env.STEAM_IDS;
    
    if (!key || !ids) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Missing env vars" })
      };
    }

    const sql = getSql();
    await sql`DELETE FROM games`;
    
    const firstId = ids.split(",")[0]?.trim();
    if (!firstId) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "No Steam IDs" })
      };
    }
    
    const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${key}&steamid=${firstId}&include_appinfo=1&format=json`;
    
    const res = await fetch(url);
    if (!res.ok) {
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Steam API error" })
      };
    }
    
    const json = await res.json();
    const games = json?.response?.games || [];
    
    if (games.length === 0) {
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "No games found" })
      };
    }
    
    let inserted = 0;
    
    // Inserir apenas os primeiros 50 jogos
    const testGames = games.slice(0, 50);
    
    for (const game of testGames) {
      try {
        const gameName = (game.name || `App ${game.appid}`).replace(/[^\x20-\x7E]/g, '').trim();
        
        await sql`
          INSERT INTO games (app_id, name, cover_url, last_seen_at, updated_at)
          VALUES (
            ${game.appid}, 
            ${gameName}, 
            ${`https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/header.jpg`}, 
            NOW(), 
            NOW()
          )
        `;
        inserted++;
      } catch (gameError) {
        console.warn(`Erro jogo ${game.appid}:`, gameError);
      }
    }
    
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        success: true,
        totalGames: games.length,
        inserted,
        message: `Inseridos ${inserted} de ${testGames.length} jogos`
      })
    };
    
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ 
        error: err instanceof Error ? err.message : "Erro desconhecido" 
      })
    };
  }
};