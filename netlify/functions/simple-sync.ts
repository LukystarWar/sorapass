import type { Handler, HandlerResponse } from "@netlify/functions";
import { getSql } from "./_db";

// Timeout para requisições Steam (15 segundos)
const STEAM_REQUEST_TIMEOUT = 15000;
// Delay entre requisições para evitar rate limiting
const REQUEST_DELAY = 500;

// Função utilitária para delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Fetch com timeout
const fetchWithTimeout = async (url: string, timeout: number = STEAM_REQUEST_TIMEOUT) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'SoraPass-Sync/1.0'
      }
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
};

export const handler: Handler = async (event): Promise<HandlerResponse> => {
  const startTime = Date.now();
  
  try {
    // Verificar se é um force update
    const forceUpdate = event.queryStringParameters?.force === 'true';
    
    console.log("🚀 Iniciando simple-sync...", forceUpdate ? "(FORCE MODE)" : "");
    
    const key = process.env.STEAM_API_KEY;
    const idsCsv = process.env.STEAM_IDS;
    
    if (!key || !idsCsv) {
      console.error("❌ Variáveis de ambiente ausentes");
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Missing env vars: STEAM_API_KEY or STEAM_IDS" })
      };
    }

    const sql = getSql();
    
    // 1) Verificar se precisa fazer sync (evitar sync desnecessário)
    console.log("🔍 Verificando necessidade de sync...");
    const lastUpdate = await sql`
      SELECT MAX(updated_at) as last_update, COUNT(*) as count 
      FROM games
    `;
    
    const currentCount = lastUpdate[0]?.count || 0;
    const lastUpdateTime = lastUpdate[0]?.last_update;
    
    // Se tem jogos e a última atualização foi há menos de 24 horas, pula (exceto se for force)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    if (!forceUpdate && currentCount > 0 && lastUpdateTime && new Date(lastUpdateTime) > oneDayAgo) {
      console.log("⏭️ Sync desnecessário - atualização recente");
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          success: true,
          method: "skip_recent_update",
          currentCount,
          lastUpdate: lastUpdateTime,
          message: "Sync pulado - última atualização há menos de 24h (use ?force=true para forçar)"
        })
      };
    }
    
    if (forceUpdate) {
      console.log("⚡ FORCE UPDATE ativado - ignorando verificação de tempo");
    }
    
    console.log("🗑️ Limpando banco de dados...");
    await sql`DELETE FROM games`;
    
    // 2) Buscar jogos do Steam com controle de rate limiting
    console.log("🎮 Buscando jogos do Steam...");
    const steamIds = idsCsv.split(",").map(s => s.trim()).filter(Boolean);
    const allGames = new Map();
    let totalProcessed = 0;
    let failedRequests = 0;
    
    for (let i = 0; i < steamIds.length; i++) {
      const steamId = steamIds[i];
      const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${key}&steamid=${steamId}&include_appinfo=1&format=json`;
      
      try {
        console.log(`📡 Requisitando Steam ID ${steamId} (${i + 1}/${steamIds.length})...`);
        
        const res = await fetchWithTimeout(url);
        
        if (!res.ok) {
          console.error(`❌ Steam API erro HTTP ${res.status} para ID ${steamId}`);
          failedRequests++;
          continue;
        }
        
        const json = await res.json();
        
        if (!json.response) {
          console.error(`❌ Resposta inválida da Steam API para ID ${steamId}`);
          failedRequests++;
          continue;
        }
        
        const games = json.response.games || [];
        console.log(`✅ ${games.length} jogos encontrados para ID ${steamId}`);
        totalProcessed += games.length;
        
        for (const game of games) {
          if (!allGames.has(game.appid)) {
            allGames.set(game.appid, game);
          }
        }
        
        // Delay entre requisições para evitar rate limiting
        if (i < steamIds.length - 1) {
          await delay(REQUEST_DELAY);
        }
        
      } catch (error) {
        console.error(`💥 Erro ao buscar Steam ID ${steamId}:`, error);
        failedRequests++;
        
        // Se é timeout ou abort, aguarda um pouco mais
        if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('timeout'))) {
          await delay(REQUEST_DELAY * 2);
        }
      }
    }
    
    if (allGames.size === 0) {
      console.error("❌ Nenhum jogo foi obtido das APIs Steam");
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          error: "No games retrieved from Steam APIs",
          failedRequests,
          steamAccounts: steamIds.length
        })
      };
    }
    
    // 3) Inserir jogos em lotes para melhor performance
    console.log(`📥 Inserindo ${allGames.size} jogos únicos no banco...`);
    let inserted = 0;
    let insertErrors = 0;
    const BATCH_SIZE = 50;
    
    const gamesArray = Array.from(allGames.values());
    
    for (let i = 0; i < gamesArray.length; i += BATCH_SIZE) {
      const batch = gamesArray.slice(i, i + BATCH_SIZE);
      
      try {
        // Inserção em lote usando transação
        await sql.begin(async (tx) => {
          for (const game of batch) {
            try {
              await tx`
                INSERT INTO games (app_id, name, cover_url, last_seen_at, updated_at)
                VALUES (
                  ${game.appid}, 
                  ${game.name || `App ${game.appid}`}, 
                  ${'https://cdn.cloudflare.steamstatic.com/steam/apps/' + game.appid + '/header.jpg'}, 
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
              console.warn(`⚠️ Erro inserindo jogo ${game.appid}:`, gameError);
              insertErrors++;
            }
          }
        });
        
        console.log(`✅ Lote ${Math.floor(i / BATCH_SIZE) + 1} inserido (${batch.length} jogos)`);
        
      } catch (batchError) {
        console.error(`💥 Erro no lote ${Math.floor(i / BATCH_SIZE) + 1}:`, batchError);
        insertErrors += batch.length;
      }
    }
    
    const executionTime = Date.now() - startTime;
    console.log(`🎉 Sync completo em ${executionTime}ms`);
    
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        success: true,
        method: forceUpdate ? "forced_clean_and_rebuild" : "smart_clean_and_rebuild",
        executionTimeMs: executionTime,
        steamAccounts: steamIds.length,
        failedSteamRequests: failedRequests,
        totalGamesProcessed: totalProcessed,
        uniqueGames: allGames.size,
        inserted,
        insertErrors,
        previousCount: currentCount,
        message: `Banco atualizado: ${currentCount} → ${inserted} jogos (${insertErrors} erros)`
      })
    };
    
  } catch (err) {
    console.error("💥 Erro fatal no simple-sync:", err);
    
    const executionTime = Date.now() - startTime;
    
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ 
        error: err instanceof Error ? err.message : String(err),
        executionTimeMs: executionTime,
        timestamp: new Date().toISOString()
      })
    };
  }
};