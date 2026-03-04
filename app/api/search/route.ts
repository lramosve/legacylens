import { NextRequest, NextResponse } from "next/server";
import { HybridSearchRetriever } from "@/lib/langchain";
import { preprocessQuery } from "@/lib/cobol-preprocessor";

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid query" },
        { status: 400 }
      );
    }

    const { normalized, wasExpanded } = preprocessQuery(query);
    const searchQuery = wasExpanded ? normalized : query;

    const retriever = new HybridSearchRetriever();
    await retriever.invoke(searchQuery);

    // Normalize RRF scores to 0-100 relative to top result
    const raw = retriever.lastRawResults;
    const maxScore = raw.length > 0 ? raw[0].score : 1;
    const results = raw.map((r) => ({
      ...r,
      score: maxScore > 0 ? r.score / maxScore : 0,
    }));

    return NextResponse.json({
      results,
      query_normalized: wasExpanded ? normalized : undefined,
      latency: {
        embedding_ms: retriever.lastEmbeddingMs,
        search_ms: retriever.lastSearchMs,
      },
    });
  } catch (err) {
    console.error("Search route error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
