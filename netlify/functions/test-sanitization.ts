import type { Handler, HandlerResponse } from "@netlify/functions";
import { getSql } from "./_db";

// Função para sanitizar strings removendo caracteres problemáticos
function sanitizeString(str: string): string {
  if (!str) return str;
  
  // Remove caracteres de controle e surrogate pairs problemáticos
  return str
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove caracteres de controle
    .replace(/[\uD800-\uDFFF]/g, '') // Remove surrogate pairs problemáticos
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove caracteres invisíveis
    .trim();
}

export const handler: Handler = async (): Promise<HandlerResponse> => {
  const debug: any = {
    step: "inicio",
    timestamp: new Date().toISOString()
  };

  try {
    debug.step = "conectando_sql";
    const sql = getSql();
    
    debug.step = "limpando_banco";
    await sql`DELETE FROM games`;
    
    debug.step = "buscando_steam_api";
    const key = process.env.STEAM_API_KEY;
    const ids = process.env.STEAM_IDS;
    
    if (!key || !ids) {
      throw new Error("Missing STEAM_API_KEY or STEAM_IDS");
    }
    
    const firstId = ids.split(",")[0]?.trim();
    const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${key}&steamid=${firstId}&include_appinfo=1&format=json`;
    
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Steam API error: ${res.status}`);
    }
    
    const json = await res.json();
    const games = json?.response?.games || [];
    
    debug.totalGames = games.length;
    debug.step = "inserindo_primeiros_10_jogos";
    
    // Inserir apenas os primeiros 10 jogos para teste
    const testGames = games.slice(0, 10);
    let inserted = 0;
    
    for (const game of testGames) {
      try {
        // Sanitizar nome do jogo antes da inserção
        const gameName = sanitizeString(game.name || `App ${game.appid}`);
        
        debug[`game_${game.appid}_original`] = game.name;
        debug[`game_${game.appid}_sanitized`] = gameName;
        
        await sql`
          INSERT INTO games (app_id, name, cover_url, last_seen_at, updated_at)
          VALUES (
            ${game.appid}, 
            ${gameName}, 
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
        debug[`game_${game.appid}_error`] = gameError instanceof Error ? gameError.message : String(gameError);
      }
    }
    
    debug.inserted = inserted;
    debug.step = "testando_snapshot";
    
    // Testar se consegue fazer snapshot sem erro
    const testGames = await sql`
      SELECT app_id, name, cover_url 
      FROM games 
      ORDER BY name 
      LIMIT 5
    `;
    
    debug.sampleGamesFromDb = testGames;
    
    // Testar JSON.stringify
    try {
      const jsonString = JSON.stringify(testGames);
      debug.jsonStringifyTest = "SUCCESS";
      debug.jsonLength = jsonString.length;
    } catch (jsonError) {
      debug.jsonStringifyTest = "FAILED";
      debug.jsonError = jsonError instanceof Error ? jsonError.message : String(jsonError);
    }
    
    debug.step = "sucesso";
    debug.message = "Teste de sanitização completo";

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(debug, null, 2)
    };

  } catch (err) {
    debug.error = err instanceof Error ? err.message : String(err);
    debug.stack = err instanceof Error ? err.stack?.split('\n').slice(0, 5) : undefined;
    
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(debug, null, 2)
    };
  }
};