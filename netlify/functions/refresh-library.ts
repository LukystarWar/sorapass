// netlify/functions/refresh-library.ts
import type { Config, Handler } from "@netlify/functions";
import { getSql } from "./_db";
import { getStore } from "@netlify/blobs";

export const config: Config = { schedule: "0 */6 * * *" };

type SteamOwnedGame = {
  appid: number;
  name?: string;
  img_icon_url?: string;
  img_logo_url?: string;
  playtime_forever?: number;
};

type Game = {
  app_id: number;
  name: string;
  cover_url?: string | null;
  developer?: string | null;
  publisher?: string | null;
  release_year?: number | null;
  genres?: string[];
};

const API = "https://api.steampowered.com";
const DETAILS = "https://store.steampowered.com/api/appdetails";

// header padrão da Steam (fallback sem appdetails)
const headerImg = (appid: number) =>
  `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;

export const handler: Handler = async () => {
  try {
    const key = process.env.STEAM_API_KEY || "";
    const idsCsv = process.env.STEAM_IDS || "";
    if (!key || !idsCsv) {
      return { statusCode: 500, body: "Missing envs (STEAM_API_KEY / STEAM_IDS)" };
    }

    const ENRICH = (process.env.ENRICH_DETAILS ?? "true") !== "false"; // def: true
    const sql = getSql();

    // 1) Coleta GetOwnedGames e consolida por appid
    const steamIds = idsCsv.split(",").map(s => s.trim()).filter(Boolean);
    const map = new Map<number, SteamOwnedGame>();

    for (const sid of steamIds) {
      const url = `${API}/IPlayerService/GetOwnedGames/v0001/?key=${encodeURIComponent(
        key
      )}&steamid=${encodeURIComponent(sid)}&include_appinfo=1&include_played_free_games=1&format=json`;

      const res = await fetch(url);
      if (!res.ok) continue;
      const json = await res.json();
      const games: SteamOwnedGame[] = json?.response?.games ?? [];
      for (const g of games) if (!map.has(g.appid)) map.set(g.appid, g);
    }

    const owned = Array.from(map.values());

    // 2) Enriquecimento (ou fallback simples)
    const enriched: Game[] = []; // <<<<<< DECLARADA AQUI

    if (!ENRICH) {
      // modo rápido: sem appdetails
      for (const g of owned) {
        enriched.push({
          app_id: g.appid,
          name: g.name || `App ${g.appid}`,
          cover_url: headerImg(g.appid),
          developer: null,
          publisher: null,
          release_year: null,
          genres: [],
        });
      }
    } else {
      const BATCH = 15; // seguro p/ evitar 429
      for (let i = 0; i < owned.length; i += BATCH) {
        const batch = owned.slice(i, i + BATCH);
        await Promise.all(
          batch.map(async (g) => {
            const appid = g.appid;
            let name = g.name || `App ${appid}`;
            let cover_url: string | null = headerImg(appid);
            let developer: string | null = null;
            let publisher: string | null = null;
            let release_year: number | null = null;
            let genres: string[] = [];

            try {
              const r = await fetch(`${DETAILS}?appids=${appid}`);
              if (r.ok) {
                const dj = await r.json();
                const entry = dj?.[appid];
                if (entry?.success && entry?.data) {
                  const d = entry.data;
                  name = d.name || name;
                  cover_url = d.header_image || cover_url;
                  if (Array.isArray(d.developers) && d.developers.length)
                    developer = d.developers[0] || null;
                  if (Array.isArray(d.publishers) && d.publishers.length)
                    publisher = d.publishers[0] || null;
                  if (d.release_date?.date) {
                    const year = parseInt(
                      (d.release_date.date.match(/\b(19|20)\d{2}\b/) || [])[0]
                    );
                    if (!Number.isNaN(year)) release_year = year;
                  }
                  if (Array.isArray(d.genres))
                    genres = d.genres.map((x: any) => x.description).filter(Boolean);
                }
              }
            } catch {
              /* segue com fallback */
            }

            enriched.push({
              app_id: appid,
              name,
              cover_url,
              developer,
              publisher,
              release_year,
              genres,
            });
          })
        );
        await new Promise((r) => setTimeout(r, 300)); // pausa entre lotes
      }
    }

    // 3) UPSERT no Postgres
    await sql`BEGIN`;
    for (const g of enriched) {
      await sql/*sql*/`
        INSERT INTO games (app_id, name, cover_url, developer, publisher, release_year, last_seen_at, updated_at)
        VALUES (${g.app_id}, ${g.name}, ${g.cover_url ?? null}, ${g.developer ?? null}, ${g.publisher ?? null}, ${g.release_year ?? null}, NOW(), NOW())
        ON CONFLICT (app_id) DO UPDATE
        SET name = EXCLUDED.name,
            cover_url = EXCLUDED.cover_url,
            developer = EXCLUDED.developer,
            publisher = EXCLUDED.publisher,
            release_year = EXCLUDED.release_year,
            last_seen_at = NOW(),
            updated_at = NOW();
      `;

      if (g.genres?.length) {
        for (const name of g.genres) {
          const rows = await sql/*sql*/`
            INSERT INTO genres (name) VALUES (${name})
            ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
            RETURNING id;
          `;
          const id = rows[0].id as number;
          await sql/*sql*/`
            INSERT INTO game_genres (app_id, genre_id)
            VALUES (${g.app_id}, ${id})
            ON CONFLICT (app_id, genre_id) DO NOTHING;
          `;
        }
      }
    }
    await sql`COMMIT`;

    // 4) Snapshot em Blobs
    const store = getStore("games");
    await store.setJSON("all.json", enriched);

    return { statusCode: 200, body: `ok: ${enriched.length} apps` };
  } catch (err: any) {
    console.error("refresh-library error:", err);
    return { statusCode: 500, body: "refresh error" };
  }
};
