import type { Handler, HandlerResponse } from "@netlify/functions";
import { getSql } from "./_db";

export const handler: Handler = async (): Promise<HandlerResponse> => {
  const debug: any = {
    step: "inicio",
    timestamp: new Date().toISOString(),
    env: {},
    steam: {},
    error: null
  };

  try {
    // Step 1: Verificar env vars
    debug.step = "verificando_env";
    const key = process.env.STEAM_API_KEY;
    const idsCsv = process.env.STEAM_IDS;
    
    debug.env = {
      hasKey: !!key,
      hasIds: !!idsCsv,
      idsCount: idsCsv ? idsCsv.split(",").length : 0
    };

    if (!key || !idsCsv) {
      debug.error = "Missing env vars";
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(debug)
      };
    }

    // Step 2: Testar primeira conta Steam
    debug.step = "testando_steam";
    const firstId = idsCsv.split(",")[0]?.trim();
    
    if (!firstId) {
      debug.error = "No Steam ID found";
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(debug)
      };
    }

    const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${key}&steamid=${firstId}&include_appinfo=1&format=json`;
    
    debug.steam.url = url.replace(key, "***");
    debug.steam.steamId = firstId;

    const res = await fetch(url);
    debug.steam.httpStatus = res.status;
    debug.steam.httpOk = res.ok;

    if (!res.ok) {
      debug.error = `Steam API returned ${res.status}`;
      debug.steam.statusText = res.statusText;
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(debug)
      };
    }

    const json = await res.json();
    debug.steam.hasResponse = !!json.response;
    debug.steam.hasGames = !!json.response?.games;
    debug.steam.gamesCount = json.response?.games?.length || 0;

    if (!json.response?.games?.length) {
      debug.error = "No games returned from Steam API";
      debug.steam.fullResponse = json;
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(debug)
      };
    }

    // Step 3: Testar banco
    debug.step = "testando_banco";
    const sql = getSql();
    
    // Teste simples de inserção
    const testGame = json.response.games[0];
    debug.steam.testGame = testGame;

    await sql`
      INSERT INTO games (app_id, name, cover_url, last_seen_at, updated_at)
      VALUES (${testGame.appid}, ${testGame.name || `App ${testGame.appid}`}, ${'https://cdn.cloudflare.steamstatic.com/steam/apps/' + testGame.appid + '/header.jpg'}, NOW(), NOW())
      ON CONFLICT (app_id) DO UPDATE
      SET name = EXCLUDED.name,
          last_seen_at = NOW(),
          updated_at = NOW()
    `;

    debug.step = "sucesso";
    debug.message = "Teste de inserção realizado com sucesso!";

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(debug, null, 2)
    };

  } catch (err) {
    debug.error = err instanceof Error ? err.message : String(err);
    debug.stack = err instanceof Error ? err.stack : undefined;
    
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(debug, null, 2)
    };
  }
};