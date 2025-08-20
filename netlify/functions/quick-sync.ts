import type { Handler, HandlerResponse } from "@netlify/functions";
import { getSql } from "./_db";

export const handler: Handler = async (): Promise<HandlerResponse> => {
  try {
    console.log("🚀 Iniciando quick-sync...");
    
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
    
    // Buscar apenas o primeiro Steam ID para teste
    const steamIds = idsCsv.split(",").map(s => s.trim()).filter(Boolean);
    const firstId = steamIds[0];
    
    console.log(`📡 Buscando jogos do Steam ID: ${firstId}`);
    
    const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${key}&steamid=${firstId}&include_appinfo=1&format=json`;
    
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Steam API error: ${res.status}`);
    }
    
    const json = await res.json();
    const games = json.response?.games || [];
    
    if (games.length === 0) {
      return {
        statusCode: 404,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "No games found" })
      };
    }
    
    console.log(`🎮 Encontrados ${games.length} jogos`);
    
    // Limpar tabela
    await sql`DELETE FROM games`;
    
    // Inserir apenas os primeiros 10 jogos para teste
    const testGames = games.slice(0, 10);
    let inserted = 0;
    
    for (const game of testGames) {
      try {
        await sql`
          INSERT INTO games (app_id, name, cover_url, last_seen_at, updated_at)
          VALUES (
            ${game.appid}, 
            ${game.name || `App ${game.appid}`}, 
            ${'https://cdn.cloudflare.steamstatic.com/steam/apps/' + game.appid + '/header.jpg'}, 
            NOW(), 
            NOW()
          )
        `;
        inserted++;
      } catch (gameError) {
        console.warn(`⚠️ Erro inserindo jogo ${game.appid}:`, gameError);
      }
    }
    
    console.log(`✅ Quick sync completo: ${inserted} jogos inseridos`);
    
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        success: true,
        totalGamesFound: games.length,
        inserted,
        message: `Quick sync: ${inserted} jogos de teste inseridos`
      })
    };
    
  } catch (err) {
    console.error("💥 Erro no quick-sync:", err);
    
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ 
        error: err instanceof Error ? err.message : String(err)
      })
    };
  }
};