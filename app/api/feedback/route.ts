import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { feedbackLimiter, applyRateLimit } from "@/lib/rate-limit";
import { feedbackBodySchema, parseBody } from "@/lib/validation";

export async function POST(req: NextRequest) {
  const rateLimited = applyRateLimit(feedbackLimiter, req);
  if (rateLimited) return rateLimited;

  try {
    const [body, validationError] = parseBody(feedbackBodySchema, await req.json());
    if (validationError) return validationError;

    const { query_log_id, query_raw, is_positive, comment, session_id } = body;

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
