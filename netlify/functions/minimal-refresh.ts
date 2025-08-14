import type { Handler, HandlerResponse } from "@netlify/functions";
import { getSql } from "./_db";

export const handler: Handler = async (): Promise<HandlerResponse> => {
  const debug = { step: "inicio", data: {} as any };
  
  try {
    // Step 1: Verificar env
    debug.step = "verificando_env";
    const key = process.env.STEAM_API_KEY;
    const idsCsv = process.env.STEAM_IDS;
    
    if (!key || !idsCsv) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Missing env vars", debug })
      };
    }
    
    debug.data.steamIds = idsCsv.split(",").length;

    // Step 2: Contar jogos no banco
    debug.step = "contando_banco";
    const sql = getSql();
    const currentResult = await sql`SELECT COUNT(*) as count FROM games`;
    debug.data.bankCount = currentResult[0]?.count;

    // Step 3: Buscar apenas da primeira conta (teste)
    debug.step = "testando_steam";
    const firstId = idsCsv.split(",")[0]?.trim();
    const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${key}&steamid=${firstId}&include_appinfo=1&format=json`;
    
    const res = await fetch(url);
    debug.data.steamStatus = res.status;
    
    if (res.ok) {
      const json = await res.json();
      debug.data.steamGames = json?.response?.games?.length || 0;
      debug.data.firstGameSample = json?.response?.games?.[0] || null;
    }
    
    // Step 4: Simular comparação básica
    debug.step = "comparacao_basica";
    debug.data.wouldRun = debug.data.bankCount > 0 && debug.data.steamGames > 0;
    
    debug.step = "sucesso";
    debug.data.message = "Teste de refresh realizado com sucesso";

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ success: true, debug })
    };

  } catch (err) {
    debug.data.error = err instanceof Error ? err.message : String(err);
    debug.data.stack = err instanceof Error ? err.stack?.split('\n').slice(0, 3) : undefined;
    
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Erro no minimal refresh", debug })
    };
  }
};