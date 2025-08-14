import { getStore } from "@netlify/blobs";

export default async () => {
    console.log("ENV CHECK", {
    NODE_VERSION: process.version,
    DATABASE_URL: !!process.env.DATABASE_URL,
    STEAM_API_KEY: !!process.env.STEAM_API_KEY,
    STEAM_IDS: process.env.STEAM_IDS
  });
  try {
    const store = getStore("games");
    const data = await store.get("all.json"); // string | null
    if (!data) {
      return new Response("snapshot not found", { status: 404 });
    }
    return new Response(data, {
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch (err) {
    console.error("snapshot error:", err);
    return new Response("snapshot error", { status: 500 });
  }
};
