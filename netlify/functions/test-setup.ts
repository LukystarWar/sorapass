import type { Handler, HandlerResponse } from "@netlify/functions";
import { getSql } from "./_db";
import { getStore } from "@netlify/blobs";

export const handler: Handler = async (event): Promise<HandlerResponse> => {
  const results: any = {
    timestamp: new Date().toISOString(),
    environment: {},
    database: {},
    blobs: {},
    steam: {}
  };

  // 1. Verificar variáveis de ambiente
  results.environment = {
    NODE_VERSION: process.version,
    DATABASE_URL: !!(process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL),
    STEAM_API_KEY: !!process.env.STEAM_API_KEY,
    STEAM_IDS: !!process.env.STEAM_IDS,
    ENRICH_DETAILS: process.env.ENRICH_DETAILS || "true"
  };

  // 2. Testar conexão com banco
  try {
    const sql = getSql();
    
    // Teste básico de conexão
    const testQuery = await sql`SELECT 1 as test, NOW() as timestamp`;
    results.database.connection = "✅ Conectado";
    results.database.timestamp = testQuery[0]?.timestamp;
    
    // Verificar se as tabelas existem
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('games', 'genres', 'game_genres')
      ORDER BY table_name
    `;
    
    results.database.tables = tables.map(t => t.table_name);
    results.database.tablesExist = {
      games: tables.some(t => t.table_name === 'games'),
      genres: tables.some(t => t.table_name === 'genres'),
      game_genres: tables.some(t => t.table_name === 'game_genres')
    };
    
    // Contar registros existentes
    if (results.database.tablesExist.games) {
      const gameCount = await sql`SELECT COUNT(*) as count FROM games`;
      results.database.gameCount = gameCount[0]?.count || 0;
    }
    
  } catch (error) {
    results.database.error = error instanceof Error ? error.message : String(error);
  }

  // 3. Testar Netlify Blobs
  try {
    const store = getStore("games");
    
    // Teste de escrita
    await store.set("test.txt", `Test at ${Date.now()}`);
    results.blobs.write = "✅ Escrita OK";
    
    // Teste de leitura
    const testData = await store.get("test.txt");
    results.blobs.read = testData ? "✅ Leitura OK" : "❌ Leitura falhou";
    
    // Verificar se existe snapshot
    const snapshot = await store.get("all.json");
    results.blobs.snapshot = snapshot ? "✅ Snapshot existe" : "❌ Snapshot não encontrado";
    
  } catch (error) {
    results.blobs.error = error instanceof Error ? error.message : String(error);
  }

  // 4. Testar API Steam (apenas uma conta para teste)
  try {
    const key = process.env.STEAM_API_KEY;
    const ids = process.env.STEAM_IDS;
    
    if (key && ids) {
      const firstId = ids.split(',')[0]?.trim();
      if (firstId) {
        const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${key}&steamid=${firstId}&include_appinfo=1&format=json`;
        
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          const gameCount = data?.response?.games?.length || 0;
          results.steam.connection = "✅ API Steam OK";
          results.steam.gamesFromFirstAccount = gameCount;
        } else {
          results.steam.error = `HTTP ${response.status}: ${response.statusText}`;
        }
      }
    } else {
      results.steam.error = "STEAM_API_KEY ou STEAM_IDS não configurados";
    }
  } catch (error) {
    results.steam.error = error instanceof Error ? error.message : String(error);
  }

  return {
    statusCode: 200,
    headers: { 
      "content-type": "application/json",
      "cache-control": "no-cache"
    },
    body: JSON.stringify(results, null, 2)
  };
};