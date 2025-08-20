import type { Handler, HandlerResponse } from "@netlify/functions";

export const handler: Handler = async (): Promise<HandlerResponse> => {
  try {
    const { STEAM_API_KEY, STEAM_IDS, NETLIFY_DATABASE_URL } = process.env;
    
    if (!STEAM_API_KEY || !STEAM_IDS || !NETLIFY_DATABASE_URL) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Missing env vars (STEAM_API_KEY, STEAM_IDS, NETLIFY_DATABASE_URL)" })
      };
    }

    // Dynamic import para evitar conflito ESM/CJS
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(NETLIFY_DATABASE_URL);
    
    // Testar conexão DB
    const test = await sql`SELECT 1 as test`;
    if (test[0]?.test !== 1) {
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "DB connection failed" })
      };
    }
    
    // Buscar jogos de todas as contas Steam (Biblioteca Familiar)
    const steamIds = STEAM_IDS.split(",").map(s => s.trim()).filter(Boolean);
    const allGames = new Map(); // Para evitar duplicatas
    let totalProcessed = 0;
    
    console.log(`🎮 Buscando jogos de ${steamIds.length} contas Steam...`);
    
    for (let i = 0; i < steamIds.length; i++) {
      const steamId = steamIds[i];
      try {
        console.log(`📡 Processando conta ${i + 1}/${steamIds.length}: ${steamId}`);
        
        const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_API_KEY}&steamid=${steamId}&include_appinfo=1&format=json`;
        
        const res = await fetch(url);
        if (!res.ok) {
          console.error(`❌ Erro Steam API ${res.status} para conta ${steamId}`);
          continue;
        }
        
        const json = await res.json();
        const games = json?.response?.games || [];
        
        console.log(`✅ ${games.length} jogos encontrados na conta ${steamId}`);
        totalProcessed += games.length;
        
        // Adicionar jogos únicos ao Map
        for (const game of games) {
          if (!allGames.has(game.appid)) {
            allGames.set(game.appid, game);
          }
        }
        
        // Delay entre requisições para evitar rate limiting
        if (i < steamIds.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
      } catch (error) {
        console.error(`💥 Erro ao processar conta ${steamId}:`, error);
      }
    }
    
    const uniqueGames = Array.from(allGames.values());
    
    if (uniqueGames.length === 0) {
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ 
          error: "Nenhum jogo encontrado em todas as contas",
          steamAccounts: steamIds.length,
          totalProcessed
        })
      };
    }
    
    console.log(`🎯 Total: ${totalProcessed} jogos processados, ${uniqueGames.length} únicos`);
    const games = uniqueGames;
    
    // Limpar tabela e inserir jogos
    await sql`DELETE FROM games`;
    
    let inserted = 0;
    for (const game of games) {
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
        `;
        inserted++;
      } catch (gameError) {
        console.warn(`Erro inserindo jogo ${game.appid}:`, gameError);
      }
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        success: true,
        steamAccounts: steamIds.length,
        totalGamesProcessed: totalProcessed,
        uniqueGamesFound: games.length,
        inserted,
        firstGame: games[0]?.name,
        message: `Biblioteca Familiar Steam: ${inserted} jogos únicos de ${steamIds.length} contas`
      })
    };
    
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ 
        error: err instanceof Error ? err.message : "Erro desconhecido",
        stack: err instanceof Error ? err.stack : undefined
      })
    };
  }
};