import type { Handler, HandlerResponse } from "@netlify/functions";
import { getSql } from "./_db";

export const handler: Handler = async (): Promise<HandlerResponse> => {
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
    const firstId = idsCsv.split(",")[0]?.trim();
    
    // Buscar apenas da primeira conta para teste
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
    
    if (!games.length) {
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "No games found", response: json })
      };
    }

    // Inserir apenas os primeiros 5 jogos para teste
    const testGames = games.slice(0, 5);
    let inserted = 0;

    for (const game of testGames) {
      try {
        await sql`
          INSERT INTO games (app_id, name, cover_url, last_seen_at, updated_at)
          VALUES (${game.appid}, ${game.name || `App ${game.appid}`}, ${'https://cdn.cloudflare.steamstatic.com/steam/apps/' + game.appid + '/header.jpg'}, NOW(), NOW())
          ON CONFLICT (app_id) DO UPDATE
          SET name = EXCLUDED.name,
              last_seen_at = NOW(),
              updated_at = NOW()
        `;
        inserted++;
      } catch (err) {
        console.error(`Erro ao inserir jogo ${game.appid}:`, err);
      }
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        success: true,
        totalGamesFound: games.length,
        inserted,
        message: `Teste realizado com ${inserted}/${testGames.length} jogos inseridos`
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ 
        error: err instanceof Error ? err.message : String(err) 
      })
    };
  }
};