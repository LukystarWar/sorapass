import type { Handler } from "@netlify/functions";
import { sql } from "./_db";

export const handler: Handler = async (event) => {
  try {
    const page = Math.max(1, Number(event.queryStringParameters?.page || 1));
    const per  = Math.min(100, Number(event.queryStringParameters?.per  || 50));
    const offset = (page - 1) * per;

    const rows = await sql/*sql*/`
      SELECT app_id, name, cover_url, developer, publisher, release_year
      FROM games
      ORDER BY name
      LIMIT ${per} OFFSET ${offset};
    `;

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
      },
      body: JSON.stringify({ page, per, results: rows }),
    };
  } catch (err) {
    console.error("games error:", err);
    return { statusCode: 500, body: "db error" };
  }
};
