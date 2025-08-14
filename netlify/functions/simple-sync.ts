import type { Handler, HandlerResponse } from "@netlify/functions";
import { getSql } from "./_db";

export const handler: Handler = async (): Promise<HandlerResponse> => {
  try {
    const key = process.env.STEAM_API_KEY;
    const idsCsv = process.env.STEAM_IDS;
    
    if (!key || !idsCsv) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Missing env vars" })
      };
    }

    const sql = getSql();
    
    // 1) Limpar banco completamente
    console.log("🗑️ Limpando banco...");
    await sql`DELETE FROM games`;
    
    // 2) Buscar jogos do Steam
    console.log("🎮 Buscando do Steam...");
    const steamIds = idsCsv.split(",").map(s => s.trim()).filter(Boolean);
    const allGames = new Map();
    
    for (const steamId of steamIds) {
      const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${key}&steamid=${steamId}&include_appinfo=1&format=json`;
      
      try {
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          const games = json?.response?.games || [];
          
          for (const game of games) {
            if (!allGames.has(game.appid)) {
              allGames.set(game.appid, game);
            }
          }
        }
      } catch (error) {
        console.warn(`Erro Steam ID ${steamId}:`, error);
      }
    }
    
    // 3) Inserir tudo novamente
    console.log("📥 Inserindo tudo...");
    let inserted = 0;
    
    for (const game of allGames.values()) {
      try {
        await sql`
          INSERT INTO games (app_id, name, cover_url, last_seen_at, updated_at)
          VALUES (${game.appid}, ${game.name || `App ${game.appid}`}, ${'https://cdn.cloudflare.steamstatic.com/steam/apps/' + game.appid + '/header.jpg'}, NOW(), NOW())
        `;
        inserted++;
      } catch (err) {
        console.warn(`Erro inserindo ${game.appid}`);
      }
    }
    
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        success: true,
        method: "clean_and_rebuild",
        steamGames: allGames.size,
        inserted,
        message: `Banco recriado com ${inserted} jogos`
      })
    };
    
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ 
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined
      })
    };
  }
};