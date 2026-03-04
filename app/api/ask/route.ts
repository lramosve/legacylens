import { NextRequest } from "next/server";
import { buildLLMChain, formatChunksAsContext } from "@/lib/langchain";
import { createServerClient } from "@/lib/supabase";
import type { AnalysisMode, ModelSpeed } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface CodeChunk {
  content: string;
  file_path: string;
  line_start: number;
  line_end: number;
  language: string;
  chunk_type: string;
  function_name: string | null;
  score?: number;
}

export async function POST(req: NextRequest) {
  try {
    const { query, chunks, sessionId, searchLatency, mode: rawMode, modelSpeed: rawSpeed } = await req.json();

    if (!query || !chunks || !Array.isArray(chunks)) {
      return new Response(
        JSON.stringify({ error: "Missing query or chunks" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const VALID_MODES: AnalysisMode[] = ["explain", "document", "translate", "business-logic"];
    const analysisMode: AnalysisMode = VALID_MODES.includes(rawMode) ? rawMode : "explain";

    const VALID_SPEEDS: ModelSpeed[] = ["fast", "quality"];
    const modelSpeed: ModelSpeed = VALID_SPEEDS.includes(rawSpeed) ? rawSpeed : "quality";

    const chunkLimit = modelSpeed === "fast" ? 5 : 10;
    const context = formatChunksAsContext((chunks as CodeChunk[]).slice(0, chunkLimit));
    const chain = buildLLMChain(analysisMode, modelSpeed);

    // Insert query_log to get log_id before streaming
    const supabase = createServerClient();
    const { data: logRow } = await supabase
      .from("query_logs")
      .insert({
        query_raw: query,
        query_normalized: null,
        latency_embedding_ms: searchLatency?.embedding_ms ?? null,
        latency_search_ms: searchLatency?.search_ms ?? null,
        retrieved_chunk_ids: (chunks as CodeChunk[]).map(
          (c: CodeChunk & { id?: number }) => c.id
        ).filter(Boolean),
        session_id: sessionId ?? null,
        analysis_mode: analysisMode,
      })
      .select("id")
      .single();

    const logId = logRow?.id ?? null;

    const encoder = new TextEncoder();
    const llmStart = Date.now();

    const stream = await chain.stream({
      question: query,
      context,
    });

    let fullAnswer = "";

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          // Send log_id first so frontend can link feedback
          if (logId) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ log_id: logId })}\n\n`
              )
            );
          }

          for await (const chunk of stream) {
            fullAnswer += chunk;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ text: chunk })}\n\n`
              )
            );
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();

          // Fire-and-forget: update query_log with answer and LLM latency
          const llmMs = Date.now() - llmStart;
          const totalMs =
            (searchLatency?.embedding_ms ?? 0) +
            (searchLatency?.search_ms ?? 0) +
            llmMs;

          if (logId) {
            supabase
              .from("query_logs")
              .update({
                answer_text: fullAnswer,
                latency_llm_ms: llmMs,
                latency_total_ms: totalMs,
              })
              .eq("id", logId)
              .then(({ error }) => {
                if (error) console.error("Failed to update query_log:", error);
              });
          }
        } catch (err) {
          console.error("Stream error:", err);
          controller.error(err);
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("Ask route error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
