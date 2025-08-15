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
    
    // 1) Verificar se precisa fazer sync (evitar sync desnecessário)
    const lastUpdate = await sql`
      SELECT MAX(updated_at) as last_update, COUNT(*) as count 
      FROM games
    `;
    
    const currentCount = lastUpdate[0]?.count || 0;
    const lastUpdateTime = lastUpdate[0]?.last_update;
    
    // Se tem jogos e a última atualização foi há menos de 1 hora, pula
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (currentCount > 0 && lastUpdateTime && new Date(lastUpdateTime) > oneHourAgo) {
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          success: true,
          method: "skip_recent_update",
          currentCount,
          lastUpdate: lastUpdateTime,
          message: "Sync pulado - última atualização recente"
        })
      };
    }
    
    console.log("🗑️ Limpando banco...");
    await sql`DELETE FROM games`;
    
    // 2) Buscar jogos do Steam
    console.log("🎮 Buscando do Steam...");
    const steamIds = idsCsv.split(",").map(s => s.trim()).filter(Boolean);
    const allGames = new Map();
    let totalProcessed = 0;
    
    for (const steamId of steamIds) {
      const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${key}&steamid=${steamId}&include_appinfo=1&format=json`;
      
      try {
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          const games = json?.response?.games || [];
          console.log(`✅ ${games.length} jogos da conta ${steamId}`);
          totalProcessed += games.length;
          
          for (const game of games) {
            if (!allGames.has(game.appid)) {
              allGames.set(game.appid, game);
            }
          }
        }
      } catch (error) {
        console.warn(`⚠️ Erro Steam ID ${steamId}:`, error);
      }
    } // ← Esta chave estava faltando!
    
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
        console.warn(`Erro inserindo ${game.appid}:`, err);
      }
    }
    
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        success: true,
        method: "smart_clean_and_rebuild",
        steamAccounts: steamIds.length,
        totalGamesProcessed: totalProcessed,
        uniqueGames: allGames.size,
        inserted,
        previousCount: currentCount,
        message: `Banco atualizado: ${currentCount} → ${inserted} jogos`
      })
    };
    
  } catch (err) {
    console.error("simple-sync error:", err);
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