import type { Handler, HandlerResponse } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

export const handler: Handler = async (event): Promise<HandlerResponse> => {
  console.log("📸 Requisição de snapshot recebida");
  
  try {
    const store = getStore("games");
    const data = await store.get("all.json");
    
    if (!data) {
      console.log("❌ Snapshot não encontrado");
      return {
        statusCode: 404,
        headers: { 
          "content-type": "application/json",
          "cache-control": "no-cache"
        },
        body: JSON.stringify({ error: "snapshot not found" })
      };
    }

    console.log("✅ Snapshot encontrado e retornado");
    
    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=3600, stale-while-revalidate=86400"
      },
      body: data // já é uma string JSON
    };
    
  } catch (err) {
    console.error("💥 Erro no snapshot:", err);
    return {
      statusCode: 500,
      headers: { 
        "content-type": "application/json",
        "cache-control": "no-cache"
      },
      body: JSON.stringify({ 
        error: "snapshot error", 
        message: err instanceof Error ? err.message : String(err) 
      })
    };
  }
};