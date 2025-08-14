import type { Handler } from "@netlify/functions";
import { sql } from "./_db";
import { getStore } from "@netlify/blobs";

export const handler: Handler = async () => {
  const out: any = {
    env: {
      DATABASE_URL: !!process.env.DATABASE_URL,
      STEAM_API_KEY: !!process.env.STEAM_API_KEY,
      STEAM_IDS: !!process.env.STEAM_IDS,
    },
    db: null,
    blobs: null,
  };

  try { await sql`select 1 as ok`; out.db = "ok"; }
  catch (e:any) { out.db = String(e?.message || e); }

  try {
    const store = getStore("games");
    await store.set("health.txt", String(Date.now()));
    out.blobs = "ok";
  } catch (e:any) {
    out.blobs = String(e?.message || e);
  }

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(out, null, 2),
  };
};
