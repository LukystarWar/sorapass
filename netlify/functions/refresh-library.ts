import type { Handler, HandlerResponse } from "@netlify/functions";
import { getSql } from "./_db";

export const handler: Handler = async (): Promise<HandlerResponse> => {
  console.log("🚀 Sync diferencial iniciado...");
  
  try {
    const key = process.env.STEAM_API_KEY;
    const idsCsv = process.env.STEAM_IDS;
    
    if (!key || !idsCsv) {
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Missing STEAM_API_KEY or STEAM_IDS" })
      };
    }

    const sql = getSql();
    const steamIds = idsCsv.split(",").map(s => s.trim()).filter(Boolean);

    // 1) Buscar app_ids atuais no banco (já são numbers, não precisa conversão)
    console.log("📚 Buscando app_ids atuais no banco...");
    const currentGamesResult = await sql`SELECT app_id FROM games ORDER BY app_id`;
    const currentAppIds = new Set<number>(currentGamesResult.map(g => g.app_id as number));
    console.log(`💾 Banco atual: ${currentAppIds.size} jogos`);

    // 2) Buscar app_ids do Steam
    console.log("🎮 Buscando app_ids do Steam...");
    const steamAppIds = new Set<number>();
    const newGames: Array<{appid: number, name?: string}> = [];

    for (const steamId of steamIds) {
      console.log(`📋 Processando Steam ID: ${steamId}`);
      
      try {
        const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${key}&steamid=${steamId}&include_appinfo=1&format=json`;
        const res = await fetch(url);
        
        if (!res.ok) {
          console.warn(`⚠️ Erro ${res.status} para ${steamId}`);
          continue;
        }

        const json = await res.json();
        const games = json?.response?.games || [];
        console.log(`✅ ${games.length} jogos encontrados para ${steamId}`);

        for (const game of games) {
          steamAppIds.add(game.appid);
          
          if (!currentAppIds.has(game.appid)) {
            newGames.push(game);
          }
        }

      } catch (error) {
        console.error(`❌ Erro ao processar ${steamId}:`, error);
      }
    }

    console.log(`🎮 Steam atual: ${steamAppIds.size} jogos únicos`);
    console.log(`🆕 Jogos novos: ${newGames.length}`);

    // 3) Identificar jogos removidos
    const removedAppIds: number[] = [];
    for (const appId of currentAppIds) {
      if (!steamAppIds.has(appId)) {
        removedAppIds.push(appId);
      }
    }
    console.log(`🗑️ Jogos removidos: ${removedAppIds.length}`);

    // 4) Aplicar mudanças
    let inserted = 0;
    let removed = 0;

    await sql`BEGIN`;

    try {
      // Inserir novos
      if (newGames.length > 0) {
        console.log("📥 Inserindo jogos novos...");
        for (const game of newGames) {
          await sql`
            INSERT INTO games (app_id, name, cover_url, last_seen_at, updated_at)
            VALUES (${game.appid}, ${game.name || `App ${game.appid}`}, ${'https://cdn.cloudflare.steamstatic.com/steam/apps/' + game.appid + '/header.jpg'}, NOW(), NOW())
          `;
          inserted++;
        }
      }

      // Remover antigos
      if (removedAppIds.length > 0) {
        console.log("🗑️ Removendo jogos órfãos...");
        for (const appId of removedAppIds) {
          await sql`DELETE FROM games WHERE app_id = ${appId}`;
          removed++;
        }
      }

      // Atualizar last_seen_at
      if (steamAppIds.size > 0) {
        console.log("🔄 Atualizando timestamps...");
        for (const appId of steamAppIds) {
          await sql`UPDATE games SET last_seen_at = NOW() WHERE app_id = ${appId}`;
        }
      }

      await sql`COMMIT`;
      console.log("✅ Mudanças aplicadas");

    } catch (error) {
      await sql`ROLLBACK`;
      throw error;
    }

    // 5) Contagem final
    const finalResult = await sql`SELECT COUNT(*) as total FROM games`;
    const finalCount = finalResult[0]?.total || 0;

    const result = {
      success: true,
      before: currentAppIds.size,
      after: finalCount,
      steamGames: steamAppIds.size,
      inserted,
      removed,
      message: `Sincronizado: ${finalCount} jogos no banco (Steam tem ${steamAppIds.size})`
    };

    console.log("🎉 Sync concluído:", result);

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(result)
    };

  } catch (err) {
    console.error("💥 Erro:", err);
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