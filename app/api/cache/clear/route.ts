import { NextRequest } from "next/server";
import { searchCache, askCache, relatedCache } from "@/lib/cache";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // Simple shared-secret auth to prevent abuse
  const { secret } = await req.json().catch(() => ({ secret: "" }));
  if (secret !== process.env.CACHE_CLEAR_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const before = {
    search: searchCache.size,
    ask: askCache.size,
    related: relatedCache.size,
  };

  searchCache.clear();
  askCache.clear();
  relatedCache.clear();

  return Response.json({
    cleared: before,
    message: "All server-side caches flushed",
  });
}
