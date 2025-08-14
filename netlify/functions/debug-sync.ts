import type { Handler, HandlerResponse } from "@netlify/functions";
import { getSql } from "./_db";

export const handler: Handler = async (): Promise<HandlerResponse> => {
  const debug: any = {
    step: "inicio",
    timestamp: new Date().toISOString()
  };

  try {
    // Step 1: Testar SQL básico
    debug.step = "testando_sql";
    const sql = getSql();
    
    const testResult = await sql`SELECT 1 as test`;
    debug.sqlTest = testResult[0]?.test === 1 ? "OK" : "FAIL";

    // Step 2: Contar jogos atuais
    debug.step = "contando_jogos";
    const countResult = await sql`SELECT COUNT(*) as count FROM games`;
    debug.currentCount = countResult[0]?.count;

    // Step 3: Buscar alguns app_ids
    debug.step = "buscando_app_ids";
    const gamesResult = await sql`SELECT app_id FROM games LIMIT 5`;
    debug.sampleAppIds = gamesResult.map(g => g.app_id);
    debug.sampleAppIdsTypes = gamesResult.map(g => typeof g.app_id);

    // Step 4: Testar conversão
    debug.step = "testando_conversao";
    const appIdsNumbers = gamesResult.map(g => Number(g.app_id));
    debug.convertedAppIds = appIdsNumbers;
    debug.convertedTypes = appIdsNumbers.map(id => typeof id);

    // Step 5: Testar Set
    debug.step = "testando_set";
    const testSet = new Set<number>(appIdsNumbers);
    debug.setSize = testSet.size;
    debug.setValues = Array.from(testSet);

    // Step 6: Testar Steam API (só verificar se conecta)
    debug.step = "testando_steam_api";
    const key = process.env.STEAM_API_KEY;
    const ids = process.env.STEAM_IDS;
    
    if (key && ids) {
      const firstId = ids.split(",")[0]?.trim();
      if (firstId) {
        const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${key}&steamid=${firstId}&include_appinfo=1&format=json`;
        
        try {
          const res = await fetch(url);
          debug.steamStatus = res.status;
          debug.steamOk = res.ok;
          
          if (res.ok) {
            const json = await res.json();
            debug.steamGamesCount = json?.response?.games?.length || 0;
          }
        } catch (steamError) {
          debug.steamError = steamError instanceof Error ? steamError.message : String(steamError);
        }
      }
    } else {
      debug.steamError = "Missing API key or Steam IDs";
    }

    debug.step = "sucesso";
    debug.message = "Debug completo realizado";

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