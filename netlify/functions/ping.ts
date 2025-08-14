// netlify/functions/ping.ts
import type { Handler } from "@netlify/functions";
import { getSql } from "./_db";
import { getStore } from "@netlify/blobs";

export const handler: Handler = async () => {
  const out: any = {
    runtime: { node: process.versions.node },
    env: {
      DATABASE_URL: !!process.env.DATABASE_URL,
      STEAM_API_KEY: !!process.env.STEAM_API_KEY,
      STEAM_IDS: !!process.env.STEAM_IDS,
      ENRICH_DETAILS: process.env.ENRICH_DETAILS ?? null,
    },
    db: null,
    blobs: null,
    snapshot: null,
  };

  // Teste DB (Postgres / Netlify DB)
  try {
    const sql = getSql();
    const r = await sql/* sql */`select 1 as ok`;
    out.db = r?.[0]?.ok === 1 ? "ok" : r;
  } catch (e: any) {
    out.db = `error: ${e?.message || String(e)}`;
  }

  // Teste Blobs + verificação do snapshot
  try {
    const store = getStore("games");
    await store.set("health.txt", String(Date.now())); // write test
    out.blobs = "ok";
    const snap = await store.get("all.json");          // read test
    out.snapshot = snap ? "found" : "missing";
  } catch (e: any) {
    out.blobs = `error: ${e?.message || String(e)}`;
  }

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(out, null, 2),
  };
};
