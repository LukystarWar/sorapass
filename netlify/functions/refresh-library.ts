import type { Handler } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { getSql } from "./_db";

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
const headerImg = (appid: number) =>
  `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;

export const handler: Handler = async (event) => {
  console.log("🚀 Iniciando refresh da biblioteca...");
  console.log("ENV CHECK", {
    NODE_VERSION: process.version,
    DATABASE_URL: !!(process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL),
    STEAM_API_KEY: !!process.env.STEAM_API_KEY,
    STEAM_IDS: !!process.env.STEAM_IDS,
    ENRICH_DETAILS: process.env.ENRICH_DETAILS
  });

  try {
    const key = process.env.STEAM_API_KEY || "";
    const idsCsv = process.env.STEAM_IDS || "";
    
    if (!key || !idsCsv) {
      console.error("❌ Variáveis de ambiente faltando");
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing envs (STEAM_API_KEY / STEAM_IDS)" })
      };
    }

    // Desative o enrich no primeiro teste com ENRICH_DETAILS=false
    const ENRICH = (process.env.ENRICH_DETAILS ?? "true") !== "false";
    console.log(`📚 Modo enriquecimento: ${ENRICH ? "ATIVO" : "DESABILITADO"}`);

    const sql = getSql();

    // 1) Consolidar jogos de todas as contas Steam
    console.log("🔍 Buscando jogos das contas Steam...");
    const steamIds = idsCsv.split(",").map((s) => s.trim()).filter(Boolean);
    const map = new Map<number, SteamOwnedGame>();

    for (const sid of steamIds) {
      console.log(`📋 Processando Steam ID: ${sid}`);
      const url = `${API}/IPlayerService/GetOwnedGames/v0001/?key=${encodeURIComponent(
        key
      )}&steamid=${encodeURIComponent(sid)}&include_appinfo=1&include_played_free_games=1&format=json`;

      try {
        const res = await fetch(url);
        if (!res.ok) {
          console.warn(`⚠️ Erro ao buscar jogos para ${sid}: ${res.status}`);
          continue;
        }
        
        const json = await res.json();
        const games: SteamOwnedGame[] = json?.response?.games ?? [];
        
        console.log(`✅ ${games.length} jogos encontrados para ${sid}`);
        
        for (const g of games) {
          if (!map.has(g.appid)) {
            map.set(g.appid, g);
          }
        }
      } catch (error) {
        console.error(`❌ Erro ao processar ${sid}:`, error);
      }
    }

    const owned = Array.from(map.values());
    console.log(`🎮 Total de jogos únicos: ${owned.length}`);

    const enriched: Game[] = [];

    // 2) Enriquecimento de dados (ou modo rápido)
    if (!ENRICH) {
      console.log("⚡ Modo rápido: apenas dados básicos");
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
      console.log("🔍 Modo completo: enriquecendo dados...");
      const BATCH = 10; // Reduzido para evitar rate limit
      
      for (let i = 0; i < owned.length; i += BATCH) {
        const batch = owned.slice(i, i + BATCH);
        console.log(`📦 Processando lote ${Math.floor(i/BATCH) + 1}/${Math.ceil(owned.length/BATCH)}`);
        
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
            } catch (error) {
              // Continua com dados básicos se falhar
              console.warn(`⚠️ Erro ao enriquecer app ${appid}:`, error);
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
        
        // Pausa entre lotes para respeitar rate limits
        if (i + BATCH < owned.length) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }

    // 3) Salvar no banco de dados
    console.log("💾 Salvando no banco de dados...");
    
    try {
      await sql`BEGIN`;
      
      for (const g of enriched) {
        await sql/* sql */`
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
          for (const genreName of g.genres) {
            try {
              const rows = await sql/* sql */`
                INSERT INTO genres (name) VALUES (${genreName})
                ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
                RETURNING id;
              `;
              const genreId = rows[0].id as number;
              
              await sql/* sql */`
                INSERT INTO game_genres (app_id, genre_id)
                VALUES (${g.app_id}, ${genreId})
                ON CONFLICT (app_id, genre_id) DO NOTHING;
              `;
            } catch (error) {
              console.warn(`⚠️ Erro ao salvar gênero ${genreName} para app ${g.app_id}:`, error);
            }
          }
        }
      }
      
      await sql`COMMIT`;
      console.log("✅ Dados salvos no banco");
      
    } catch (error) {
      await sql`ROLLBACK`;
      throw error;
    }

    // 4) Criar snapshot em Blobs para acesso rápido
    console.log("📸 Criando snapshot...");
    try {
      const store = getStore("games");
      await store.setJSON("all.json", enriched);
      console.log("✅ Snapshot criado");
    } catch (error) {
      console.error("❌ Erro ao criar snapshot:", error);
      // Não falha a operação se o snapshot falhar
    }

    const result = {
      success: true,
      totalGames: enriched.length,
      steamAccounts: steamIds.length,
      enrichmentMode: ENRICH ? "full" : "basic",
      timestamp: new Date().toISOString()
    };

    console.log("🎉 Refresh concluído:", result);

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(result)
    };

  } catch (err) {
    console.error("💥 Erro durante refresh:", err);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ 
        error: "refresh error", 
        message: err instanceof Error ? err.message : String(err) 
      })
    };
  }
};