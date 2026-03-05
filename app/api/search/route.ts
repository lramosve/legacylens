import { NextRequest, NextResponse } from "next/server";
import { HybridSearchRetriever } from "@/lib/langchain";
import { preprocessQuery } from "@/lib/cobol-preprocessor";
import { searchCache, searchCacheKey } from "@/lib/cache";
import { searchLimiter, applyRateLimit } from "@/lib/rate-limit";
import { searchBodySchema, parseBody } from "@/lib/validation";

export async function POST(req: NextRequest) {
  const rateLimited = applyRateLimit(searchLimiter, req);
  if (rateLimited) return rateLimited;

  try {
    const [body, validationError] = parseBody(searchBodySchema, await req.json());
    if (validationError) return validationError;

    const { query } = body;

    const { normalized, wasExpanded } = preprocessQuery(query);
    const searchQuery = wasExpanded ? normalized : query;

    // Check cache first
    const cacheKey = searchCacheKey(searchQuery);
    const cached = searchCache.get(cacheKey);
    if (cached) {
      return NextResponse.json({
        ...cached,
        cached: true,
      });
    }

    const retriever = new HybridSearchRetriever();
    await retriever.invoke(searchQuery);

    // Normalize RRF scores to 0-100 relative to top result
    const raw = retriever.lastRawResults;
    const maxScore = raw.length > 0 ? raw[0].score : 1;
    const results = raw.map((r) => ({
      ...r,
      score: maxScore > 0 ? r.score / maxScore : 0,
    }));

    const response = {
      results,
      query_normalized: wasExpanded ? normalized : undefined,
      latency: {
        embedding_ms: retriever.lastEmbeddingMs,
        search_ms: retriever.lastSearchMs,
      },
    };

    // Store in cache
    searchCache.set(cacheKey, response as typeof cached & typeof response);

    return NextResponse.json(response);
  } catch (err) {
    console.error("Search route error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
