import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { statusLimiter, applyRateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const rateLimited = applyRateLimit(statusLimiter, req);
  if (rateLimited) return rateLimited;
  try {
    const supabase = createServerClient();

    // Get total count
    const { count, error: countError } = await supabase
      .from("code_chunks")
      .select("*", { count: "exact", head: true });

    if (countError) {
      return NextResponse.json(
        { error: countError.message },
        { status: 500 }
      );
    }

    // Get breakdown by component
    const { data: componentData } = await supabase.rpc("get_chunk_stats_by_component").select();

    // Get breakdown by language
    const { data: languageData } = await supabase.rpc("get_chunk_stats_by_language").select();

    return NextResponse.json({
      total_chunks: count || 0,
      by_component: componentData || [],
      by_language: languageData || [],
    });
  } catch (err) {
    console.error("Status route error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
