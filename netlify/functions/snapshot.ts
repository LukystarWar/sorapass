import { getStore } from "@netlify/blobs";

export default async () => {
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
