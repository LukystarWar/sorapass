import type { Handler, HandlerResponse } from "@netlify/functions";
import { getSql } from "./_db";

export const handler: Handler = async (): Promise<HandlerResponse> => {
  console.log("🚀 Working refresh iniciado...");
  
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
    const steamIds = idsCsv.split(",").map(s => s.trim()).filter(Boolean);
    
    let totalProcessed = 0;
    let totalInserted = 0;
    const results: any[] = [];

    // Processar uma conta por vez para evitar timeout
    for (const steamId of steamIds) {
      console.log(`📋 Processando Steam ID: ${steamId}`);
      
      try {
        const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${key}&steamid=${steamId}&include_appinfo=1&format=json`;
        
        const res = await fetch(url);
        if (!res.ok) {
          console.warn(`⚠️ Erro ${res.status} para ${steamId}`);
          results.push({ steamId, error: `HTTP ${res.status}`, games: 0 });
          continue;
        }

        const json = await res.json();
        const games = json?.response?.games || [];
        
        console.log(`✅ ${games.length} jogos encontrados para ${steamId}`);
        totalProcessed += games.length;

        // Inserir jogos em lotes pequenos
        let inserted = 0;
        for (const game of games) {
          try {
            await sql`
              INSERT INTO games (app_id, name, cover_url, last_seen_at, updated_at)
              VALUES (${game.appid}, ${game.name || `App ${game.appid}`}, ${'https://cdn.cloudflare.steamstatic.com/steam/apps/' + game.appid + '/header.jpg'}, NOW(), NOW())
              ON CONFLICT (app_id) DO UPDATE
              SET name = EXCLUDED.name,
                  cover_url = EXCLUDED.cover_url,
                  last_seen_at = NOW(),
                  updated_at = NOW()
            `;
            inserted++;
          } catch (err) {
            console.warn(`Erro ao inserir jogo ${game.appid}:`, err);
          }
        }
        
        totalInserted += inserted;
        results.push({ 
          steamId, 
          found: games.length, 
          inserted,
          success: true 
        });

        // Pequena pausa entre contas
        if (steamIds.indexOf(steamId) < steamIds.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }

      } catch (error) {
        console.error(`❌ Erro ao processar ${steamId}:`, error);
        results.push({ 
          steamId, 
          error: error instanceof Error ? error.message : String(error),
          games: 0 
        });
      }
    }

    const result = {
      success: true,
      summary: {
        accountsProcessed: steamIds.length,
        totalGamesProcessed: totalProcessed,
        totalGamesInserted: totalInserted,
        timestamp: new Date().toISOString()
      },
      details: results
    };

    console.log("✅ Working refresh concluído:", result.summary);

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(result)
    };

  } catch (err) {
    console.error("💥 Erro durante working refresh:", err);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ 
        error: err instanceof Error ? err.message : String(err) 
      })
    };
  }
};