import type { Handler } from "@netlify/functions";
import { sql } from "./_db";

export const handler: Handler = async (event) => {
  const bits = (event.path || "").split("/");
  const idStr = bits[bits.length - 1] || event.queryStringParameters?.id;
  const id = Number(idStr);
  if (!id) {
    return { statusCode: 400, body: "missing id" };
  }

  const rows = await sql/*sql*/`
    SELECT g.*, COALESCE(json_agg(gn.name) FILTER (WHERE gn.name IS NOT NULL), '[]') AS genres
    FROM games g
    LEFT JOIN game_genres gg ON gg.app_id = g.app_id
    LEFT JOIN genres gn ON gn.id = gg.genre_id
    WHERE g.app_id = ${id}
    GROUP BY g.app_id;
  `;
  const game = rows[0] || null;

  return {
    statusCode: game ? 200 : 404,
    headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" },
    body: JSON.stringify(game),
  };
};
