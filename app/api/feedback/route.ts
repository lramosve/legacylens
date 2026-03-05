import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { feedbackLimiter, applyRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const rateLimited = applyRateLimit(feedbackLimiter, req);
  if (rateLimited) return rateLimited;

  try {
    const { query_log_id, query_raw, is_positive, comment, session_id } =
      await req.json();

    if (typeof is_positive !== "boolean") {
      return NextResponse.json(
        { error: "is_positive (boolean) is required" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    const { error } = await supabase.from("feedback").insert({
      query_log_id: query_log_id ?? null,
      query_raw: query_raw ?? null,
      is_positive,
      comment: comment ?? null,
      session_id: session_id ?? null,
    });

    if (error) {
      console.error("Feedback insert error:", error);
      return NextResponse.json(
        { error: "Failed to save feedback" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Feedback route error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
