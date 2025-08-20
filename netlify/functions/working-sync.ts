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
    
    // Buscar apenas da primeira conta Steam
    const firstId = STEAM_IDS.split(",")[0]?.trim();
    const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_API_KEY}&steamid=${firstId}&include_appinfo=1&format=json`;
    
    const res = await fetch(url);
    if (!res.ok) {
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: `Steam API error: ${res.status}` })
      };
    }
    
    const json = await res.json();
    const games = json?.response?.games || [];
    
    if (games.length === 0) {
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "No games found" })
      };
    }
    
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
        gamesFound: games.length,
        inserted,
        firstGame: games[0]?.name,
        message: `Sync completo: ${inserted} jogos inseridos`
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