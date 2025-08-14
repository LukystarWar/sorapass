import type { Handler } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

export const handler: Handler = async () => {
  const store = getStore("games");
  const data = await store.get("all.json"); // retorna string | null
  if (!data) return { statusCode: 404, body: "snapshot not found" };
  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
    },
    body: data,
  };
};
