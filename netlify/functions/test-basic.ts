import type { Handler, HandlerResponse } from "@netlify/functions";

export const handler: Handler = async (): Promise<HandlerResponse> => {
  try {
    const key = process.env.STEAM_API_KEY;
    const ids = process.env.STEAM_IDS;
    const { DATABASE_URL } = process.env;
    
    if (!key || !ids || !DATABASE_URL) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Missing env vars" })
      };
    }

    // Dynamic import para evitar conflito ESM/CJS
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(DATABASE_URL);
    
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
    const firstId = ids.split(",")[0]?.trim();
    const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${key}&steamid=${firstId}&include_appinfo=1&format=json`;
    
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
    
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        success: true,
        dbTest: "OK",
        steamTest: "OK", 
        gamesFound: games.length,
        firstGame: games[0]?.name,
        message: "Teste básico passou - Steam API e DB funcionando"
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