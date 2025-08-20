import type { Handler, HandlerResponse } from "@netlify/functions";
import { getSql } from "./_db";

export const handler: Handler = async (event): Promise<HandlerResponse> => {
  const startTime = Date.now();
  
  try {
    const forceUpdate = event.queryStringParameters?.force === 'true';
    console.log("🚀 Iniciando sync Steam completo...");
    
    const key = process.env.STEAM_API_KEY;
    const idsCsv = process.env.STEAM_IDS;
    
    if (!key || !idsCsv) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Missing STEAM_API_KEY or STEAM_IDS" })
      };
    }

    const sql = getSql();
    
    // Verificar se precisa fazer sync
    const lastUpdate = await sql`SELECT MAX(updated_at) as last_update, COUNT(*) as count FROM games`;
    const currentCount = Number(lastUpdate[0]?.count || 0);
    const lastUpdateTime = lastUpdate[0]?.last_update;
    
    // Só faz sync se for force ou se não há jogos ou se passou mais de 6 horas
    if (!forceUpdate && currentCount > 0 && lastUpdateTime) {
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
      if (new Date(lastUpdateTime) > sixHoursAgo) {
        return {
          statusCode: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            success: true,
            message: "Sync não necessário - última atualização recente",
            currentCount,
            lastUpdate: lastUpdateTime
          })
        };
      }
    }
    
    console.log("🗑️ Limpando banco...");
    await sql`DELETE FROM games`;
    
    console.log("🎮 Buscando jogos de todas as contas Steam...");
    const steamIds = idsCsv.split(",").map(s => s.trim()).filter(Boolean);
    const allGames = new Map();
    
    for (const steamId of steamIds) {
      try {
        const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${key}&steamid=${steamId}&include_appinfo=1&format=json`;
        
        console.log(`📡 Buscando Steam ID ${steamId}...`);
        const res = await fetch(url);
        if (!res.ok) {
          console.error(`❌ Steam API erro ${res.status} para ID ${steamId}`);
          continue;
        }
        
        const json = await res.json();
        const games = json?.response?.games || [];
        
        console.log(`✅ ${games.length} jogos encontrados para ID ${steamId}`);
        
        for (const game of games) {
          if (!allGames.has(game.appid)) {
            allGames.set(game.appid, game);
          }
        }
        
        // Delay para evitar rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`Erro Steam ID ${steamId}:`, error);
      }
    }
    
    if (allGames.size === 0) {
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Nenhum jogo encontrado" })
      };
    }
    
    console.log(`📥 Inserindo ${allGames.size} jogos únicos...`);
    let inserted = 0;
    
    const gamesArray = Array.from(allGames.values());
    for (const game of gamesArray) {
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
          ON CONFLICT (app_id) DO UPDATE SET
            name = EXCLUDED.name,
            cover_url = EXCLUDED.cover_url,
            last_seen_at = NOW(),
            updated_at = NOW()
        `;
        inserted++;
      } catch (gameError) {
        console.warn(`Erro inserindo jogo ${game.appid}:`, gameError);
      }
    }
    
    console.log("✅ Jogos inseridos no banco com sucesso");
    
    const executionTime = Date.now() - startTime;
    console.log(`🎉 Sync completo em ${executionTime}ms`);
    
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        success: true,
        executionTimeMs: executionTime,
        steamAccounts: steamIds.length,
        uniqueGames: allGames.size,
        inserted,
        previousCount: currentCount,
        message: `Sync completo: ${currentCount} → ${inserted} jogos de ${steamIds.length} contas Steam`
      })
    };
    
  } catch (err) {
    console.error("💥 Erro no sync:", err);
    
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ 
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString()
      })
    };
  }
};