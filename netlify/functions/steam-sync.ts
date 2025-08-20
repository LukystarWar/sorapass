import type { Handler, HandlerResponse } from "@netlify/functions";

export const handler: Handler = async (): Promise<HandlerResponse> => {
  try {
    const { STEAM_API_KEY, STEAM_IDS, NETLIFY_DATABASE_URL } = process.env;

    if (!STEAM_API_KEY || !STEAM_IDS || !NETLIFY_DATABASE_URL) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Missing env vars (STEAM_API_KEY, STEAM_IDS, NETLIFY_DATABASE_URL)" }),
      };
    }

    // ✅ Dynamic import evita crash ESM/CJS
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(NETLIFY_DATABASE_URL);

    // Teste DB
    const test = await sql`select 1 as test`;
    if (test[0]?.test !== 1) {
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "DB connection failed" }),
      };
    }

    // Steam (pega só o primeiro id)
    const steamid = STEAM_IDS.split(",")[0].trim();
    const url = new URL("https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/");
    url.searchParams.set("key", STEAM_API_KEY);
    url.searchParams.set("steamid", steamid);
    url.searchParams.set("include_appinfo", "1");
    url.searchParams.set("include_played_free_games", "1"); // opcional, mas ajuda
    url.searchParams.set("format", "json");

    const res = await fetch(url);
    if (!res.ok) {
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: `Steam API error: ${res.status}` }),
      };
    }

    const data = await res.json();
    const games = data?.response?.games ?? [];

    // Se a biblioteca estiver privada, a Steam devolve array vazio.
    if (!Array.isArray(games) || games.length === 0) {
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          success: true,
          dbTest: "OK",
          steamTest: "OK",
          gamesFound: 0,
          note: "Nenhum jogo retornado (verifique privacidade: Game details = Public).",
        }),
      };
    }

    // Limpar tabela existente
    await sql`DELETE FROM games`;

    // Inserção em lote usando a tabela games do projeto
    for (const g of games) {
      await sql`
        INSERT INTO games (app_id, name, cover_url, last_seen_at, updated_at)
        VALUES (
          ${g.appid}, 
          ${g.name || `App ${g.appid}`}, 
          ${`https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/header.jpg`}, 
          NOW(), 
          NOW()
        )
        ON CONFLICT (app_id) DO UPDATE SET
          name = EXCLUDED.name,
          cover_url = EXCLUDED.cover_url,
          last_seen_at = NOW(),
          updated_at = NOW()
      `;
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
        message: "Steam API ok e Neon populado com sucesso.",
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        error: err instanceof Error ? err.message : "Erro desconhecido",
        stack: err instanceof Error ? err.stack : undefined,
      }),
    };
  }
};
