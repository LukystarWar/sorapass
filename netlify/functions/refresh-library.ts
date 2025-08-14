import type { Handler, HandlerResponse } from "@netlify/functions";
import { getSql } from "./_db";

type SteamGame = {
  appid: number;
  name?: string;
};

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
    
    // 1) Buscar app_ids atuais no banco
    console.log("📚 App_ids no banco...");
    const currentResult = await sql`SELECT app_id FROM games`;
    const currentAppIds = new Set<number>(currentResult.map(g => g.app_id as number));
    
    // 2) Buscar app_ids do Steam
    console.log("🎮 App_ids do Steam...");
    const steamIds = idsCsv.split(",").map(s => s.trim()).filter(Boolean);
    const steamGames = new Map<number, SteamGame>();
    
    console.log(`📋 Processando ${steamIds.length} contas Steam...`);
    
    for (const steamId of steamIds) {
      console.log(`⚙️ Processando Steam ID: ${steamId}`);
      const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${key}&steamid=${steamId}&include_appinfo=1&format=json`;
      
      try {
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          const games: SteamGame[] = json?.response?.games || [];
          console.log(`✅ ${games.length} jogos encontrados para Steam ID ${steamId}`);
          
          for (const game of games) {
            if (!steamGames.has(game.appid)) {
              steamGames.set(game.appid, game);
            }
          }
        } else {
          console.warn(`⚠️ Erro ${res.status} para Steam ID ${steamId}`);
        }
      } catch (error) {
        console.warn(`❌ Erro ao processar Steam ID ${steamId}:`, error);
      }
    }
    
    console.log(`🎮 Total de jogos únicos encontrados: ${steamGames.size}`);
    const steamAppIds = new Set<number>(steamGames.keys());
    
    // 3) Calcular diferenças
    const toAdd: SteamGame[] = [];
    const toRemove: number[] = [];
    
    // Jogos para adicionar (no Steam, mas não no banco)
    for (const appId of steamAppIds) {
      if (!currentAppIds.has(appId)) {
        const game = steamGames.get(appId);
        if (game) {
          toAdd.push(game);
        }
      }
    }
    
    // Jogos para remover (no banco, mas não no Steam)
    for (const appId of currentAppIds) {
      if (!steamAppIds.has(appId)) {
        toRemove.push(appId);
      }
    }
    
    console.log(`📊 Para adicionar: ${toAdd.length}, Para remover: ${toRemove.length}`);
    
    // 4) Aplicar mudanças
    let added = 0;
    let removed = 0;
    
    // Remover jogos órfãos
    for (const appId of toRemove) {
      try {
        await sql`DELETE FROM games WHERE app_id = ${appId}`;
        removed++;
      } catch (err) {
        console.warn(`Erro removendo ${appId}`);
      }
    }
    
    // Adicionar jogos novos
    for (const game of toAdd) {
      try {
        await sql`
          INSERT INTO games (app_id, name, cover_url, last_seen_at, updated_at)
          VALUES (${game.appid}, ${game.name || `App ${game.appid}`}, ${'https://cdn.cloudflare.steamstatic.com/steam/apps/' + game.appid + '/header.jpg'}, NOW(), NOW())
        `;
        added++;
      } catch (err) {
        console.warn(`Erro inserindo ${game.appid}`);
      }
    }
    
    // Atualizar timestamps dos jogos existentes (só se houve mudanças)
    if (added > 0 || removed > 0) {
      for (const appId of steamAppIds) {
        if (currentAppIds.has(appId)) {
          try {
            await sql`UPDATE games SET last_seen_at = NOW() WHERE app_id = ${appId}`;
          } catch (err) {
            console.warn(`Erro atualizando ${appId}`);
          }
        }
      }
    }
    
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        success: true,
        method: "differential_sync",
        before: currentAppIds.size,
        steamTotal: steamAppIds.size,
        added,
        removed,
        after: currentAppIds.size + added - removed,
        message: added === 0 && removed === 0 ? "Nenhuma mudança necessária" : `${added} adicionados, ${removed} removidos`
      })
    };
    
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ 
        error: err instanceof Error ? err.message : String(err)
      })
    };
  }
};