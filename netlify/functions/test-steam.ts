import type { Handler, HandlerResponse } from "@netlify/functions";

// Timeout para requisições Steam (15 segundos)
const STEAM_REQUEST_TIMEOUT = 15000;

// Fetch com timeout simples
const fetchWithTimeout = async (url: string, timeout: number = STEAM_REQUEST_TIMEOUT) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'SoraPass-Test/1.0'
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
    console.log("🧪 Teste Steam API iniciado...");
    
    const key = process.env.STEAM_API_KEY;
    const idsCsv = process.env.STEAM_IDS;
    
    if (!key) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ 
          error: "STEAM_API_KEY não encontrada",
          hasKey: false
        })
      };
    }
    
    if (!idsCsv) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ 
          error: "STEAM_IDS não encontrado",
          hasKey: true,
          hasIds: false
        })
      };
    }

    const steamIds = idsCsv.split(",").map(s => s.trim()).filter(Boolean);
    console.log(`📋 Steam IDs encontrados: ${steamIds.length}`);
    
    const results = [];
    let totalGames = 0;
    let totalProcessed = 0;
    let uniqueGames = new Set();
    
    for (let i = 0; i < steamIds.length; i++) {
      const steamId = steamIds[i];
      const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${key}&steamid=${steamId}&include_appinfo=1&format=json`;
      
      try {
        console.log(`🎮 Testando Steam ID: ${steamId} (${i + 1}/${steamIds.length})`);
        
        const res = await fetchWithTimeout(url);
        
        if (!res.ok) {
          results.push({
            steamId,
            status: 'error',
            httpStatus: res.status,
            error: `HTTP ${res.status}`
          });
          continue;
        }
        
        const json = await res.json();
        
        if (!json.response) {
          results.push({
            steamId,
            status: 'error',
            error: 'Resposta inválida da Steam API'
          });
          continue;
        }
        
        const games = json.response.games || [];
        totalProcessed += games.length;
        
        // Contar jogos únicos
        games.forEach(game => {
          if (game.appid) {
            uniqueGames.add(game.appid);
          }
        });
        
        results.push({
          steamId,
          status: 'success',
          gamesCount: games.length,
          sampleGames: games.slice(0, 3).map(g => ({ id: g.appid, name: g.name }))
        });
        
        console.log(`✅ Steam ID ${steamId}: ${games.length} jogos`);
        
      } catch (error) {
        console.error(`❌ Erro Steam ID ${steamId}:`, error);
        results.push({
          steamId,
          status: 'error',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    totalGames = uniqueGames.size;
    const executionTime = Date.now() - startTime;
    
    console.log(`🎉 Teste completo: ${totalGames} jogos únicos em ${executionTime}ms`);
    
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        success: true,
        executionTimeMs: executionTime,
        steamAccounts: steamIds.length,
        totalGamesFromAllAccounts: totalProcessed,
        uniqueGames: totalGames,
        results,
        summary: {
          successful: results.filter(r => r.status === 'success').length,
          failed: results.filter(r => r.status === 'error').length
        }
      })
    };
    
  } catch (err) {
    console.error("💥 Erro fatal no teste Steam:", err);
    
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