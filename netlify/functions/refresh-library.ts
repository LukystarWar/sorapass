import type { Handler, HandlerResponse } from "@netlify/functions";
import { getSql } from "./_db";

type SteamGame = {
  appid: number;
  name?: string;
};

const API = "https://api.steampowered.com";
const headerImg = (appid: number) =>
  `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;

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

    // 1) Buscar todos os app_ids atuais no banco
    console.log("📚 Buscando app_ids atuais no banco...");
    const currentGamesResult = await sql`
      SELECT app_id FROM games ORDER BY app_id
    `;
    const currentAppIds = new Set<number>(currentGamesResult.map(g => Number(g.app_id)));
    console.log(`💾 Banco atual: ${currentAppIds.size} jogos`);

    // 2) Buscar todos os app_ids das contas Steam
    console.log("🎮 Buscando app_ids de todas as contas Steam...");
    const steamAppIds = new Set<number>();
    const newGames: SteamGame[] = [];

    for (const steamId of steamIds) {
      console.log(`📋 Processando Steam ID: ${steamId}`);
      
      try {
        const url = `${API}/IPlayerService/GetOwnedGames/v0001/?key=${key}&steamid=${steamId}&include_appinfo=1&format=json`;
        const res = await fetch(url);
        
        if (!res.ok) {
          console.warn(`⚠️ Erro ${res.status} para ${steamId}`);
          continue;
        }

        const json = await res.json();
        const games: SteamGame[] = json?.response?.games || [];
        console.log(`✅ ${games.length} jogos encontrados para ${steamId}`);

        for (const game of games) {
          steamAppIds.add(game.appid);
          
          // Se é novo, adiciona na lista para inserção
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

    // 3) Identificar jogos removidos (estão no banco mas não no Steam)
    const removedAppIds: number[] = [];
    for (const appId of currentAppIds) {
      if (!steamAppIds.has(appId)) {
        removedAppIds.push(appId);
      }
    }
    console.log(`🗑️ Jogos removidos: ${removedAppIds.length}`);

    // 4) Aplicar mudanças no banco
    let inserted = 0;
    let removed = 0;

    await sql`BEGIN`;

    try {
      // Inserir jogos novos
      if (newGames.length > 0) {
        console.log("📥 Inserindo jogos novos...");
        
        for (const game of newGames) {
          try {
            await sql`
              INSERT INTO games (app_id, name, cover_url, last_seen_at, updated_at)
              VALUES (${game.appid}, ${game.name || `App ${game.appid}`}, ${headerImg(game.appid)}, NOW(), NOW())
            `;
            inserted++;
          } catch (err) {
            console.warn(`Erro ao inserir ${game.appid}:`, err);
          }
        }
      }

      // Remover jogos que não estão mais disponíveis
      if (removedAppIds.length > 0) {
        console.log("🗑️ Removendo jogos não disponíveis...");
        
        for (const appId of removedAppIds) {
          try {
            await sql`DELETE FROM games WHERE app_id = ${appId}`;
            removed++;
          } catch (err) {
            console.warn(`Erro ao remover ${appId}:`, err);
          }
        }
      }

      // Atualizar last_seen_at dos jogos que ainda existem
      if (steamAppIds.size > 0) {
        console.log("🔄 Atualizando last_seen_at...");
        const appIdsArray = Array.from(steamAppIds);
        
        // Atualizar em lotes para evitar query muito grande
        for (let i = 0; i < appIdsArray.length; i += 100) {
          const batch = appIdsArray.slice(i, i + 100);
          await sql`
            UPDATE games 
            SET last_seen_at = NOW() 
            WHERE app_id = ANY(${batch})
          `;
        }
      }

      await sql`COMMIT`;
      console.log("✅ Transação commitada");

    } catch (error) {
      await sql`ROLLBACK`;
      throw error;
    }

    // 5) Resultado final
    const finalCount = await sql`SELECT COUNT(*) as total FROM games`;
    const total = finalCount[0]?.total || 0;

    const result = {
      success: true,
      summary: {
        steamAccounts: steamIds.length,
        steamGamesTotal: steamAppIds.size,
        bankBefore: currentAppIds.size,
        bankAfter: total,
        gamesInserted: inserted,
        gamesRemoved: removed,
        timestamp: new Date().toISOString()
      },
      changes: {
        added: inserted > 0 ? `${inserted} jogos adicionados` : "Nenhum jogo novo",
        removed: removed > 0 ? `${removed} jogos removidos` : "Nenhum jogo removido",
        updated: `${steamAppIds.size} jogos com last_seen_at atualizado`
      }
    };

    console.log("🎉 Sync diferencial concluído:", result.summary);

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(result)
    };

  } catch (err) {
    console.error("💥 Erro durante sync diferencial:", err);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ 
        error: err instanceof Error ? err.message : String(err) 
      })
    };
  }
};