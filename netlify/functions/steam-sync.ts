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

    // (Opcional) Criar tabela e upsert simplificado
    await sql`
      create table if not exists steam_games (
        appid integer primary key,
        name text not null,
        playtime_forever integer not null default 0,
        img_icon_url text,
        img_logo_url text
      )
    `;

    // Inserção em lote (simples e segura)
    for (const g of games) {
      await sql`
        insert into steam_games (appid, name, playtime_forever, img_icon_url, img_logo_url)
        values (${g.appid}, ${g.name}, ${g.playtime_forever}, ${g.img_icon_url}, ${g.img_logo_url})
        on conflict (appid) do update
          set name = excluded.name,
              playtime_forever = excluded.playtime_forever,
              img_icon_url = excluded.img_icon_url,
              img_logo_url = excluded.img_logo_url
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
