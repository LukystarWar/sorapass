import type { Handler } from "@netlify/functions";
import { getSql } from "./_db";

export const handler: Handler = async (event) => {
  try {
    // id pode vir no path (/api/game/570) ou como ?id=570
    const bits = (event.path || "").split("/");
    const last = bits[bits.length - 1];
    const idStr = event.queryStringParameters?.id || last;
    const id = Number(idStr);
    if (!id) {
      return { statusCode: 400, body: "missing id" };
    }

    const sql = getSql();

    const rows = await sql/* sql */`
      SELECT
        g.*,
        COALESCE(
          json_agg(gn.name) FILTER (WHERE gn.name IS NOT NULL),
          '[]'
        ) AS genres
      FROM games g
      LEFT JOIN game_genres gg ON gg.app_id = g.app_id
      LEFT JOIN genres gn ON gn.id = gg.genre_id
      WHERE g.app_id = ${id}
      GROUP BY g.app_id;
    `;

    const game = rows[0] || null;

    return {
      statusCode: game ? 200 : 404,
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=3600",
      },
      body: JSON.stringify(game),
    };
  } catch (err) {
    console.error("game error:", err);
    return { statusCode: 500, body: "db error" };
  }
};
