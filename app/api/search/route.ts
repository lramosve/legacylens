import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { embedQuery } from "@/lib/voyage";

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid query" },
        { status: 400 }
      );
    }

    const queryEmbedding = await embedQuery(query);
    const supabase = createServerClient();

    const { data, error } = await supabase.rpc("hybrid_search_code_chunks", {
      query_text: query,
      query_embedding: JSON.stringify(queryEmbedding),
      match_count: 15,
      full_text_weight: 1,
      semantic_weight: 1,
      rrf_k: 50,
    });

    if (error) {
      console.error("Search error:", error);
      return NextResponse.json(
        { error: "Search failed", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ results: data || [] });
  } catch (err) {
    console.error("Search route error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
