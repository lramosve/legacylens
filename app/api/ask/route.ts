import { NextRequest } from "next/server";
import { buildRawLLMChain, formatChunksAsContext } from "@/lib/langchain";
import { createServerClient } from "@/lib/supabase";
import { askCache, askCacheKey } from "@/lib/cache";
import { askLimiter, applyRateLimit } from "@/lib/rate-limit";
import { askBodySchema, parseBody } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const rateLimited = applyRateLimit(askLimiter, req);
  if (rateLimited) return rateLimited;

  try {
    const [body, validationError] = parseBody(askBodySchema, await req.json());
    if (validationError) return validationError;

    const { query, chunks, sessionId, searchLatency } = body;
    const analysisMode = body.mode ?? "explain";
    const modelSpeed = body.modelSpeed ?? "quality";

    const chunkLimit = modelSpeed === "fast" ? 3 : 5;

    // Check cache for identical query + mode + speed
    const cacheKey = askCacheKey(query, analysisMode, modelSpeed);
    const cached = askCache.get(cacheKey);
    if (cached) {
      const encoder = new TextEncoder();
      const cachedStream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ text: cached.answer, cached: true })}\n\n`)
          );
          if (cached.tokens) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ tokens: cached.tokens })}\n\n`)
            );
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });
      return new Response(cachedStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const context = formatChunksAsContext(chunks.slice(0, chunkLimit));
    const chain = buildRawLLMChain(analysisMode, modelSpeed);

    // Start LLM stream and query_log insert in parallel (non-blocking)
    const supabase = createServerClient();
    const logPromise = supabase
      .from("query_logs")
      .insert({
        query_raw: query,
        query_normalized: null,
        latency_embedding_ms: searchLatency?.embedding_ms ?? null,
        latency_search_ms: searchLatency?.search_ms ?? null,
        retrieved_chunk_ids: chunks.map((c) => c.id).filter(Boolean),
        session_id: sessionId ?? null,
        analysis_mode: analysisMode,
      })
      .select("id")
      .single();

    const encoder = new TextEncoder();
    const llmStart = Date.now();

    const stream = await chain.stream({
      question: query,
      context,
    });

    let fullAnswer = "";
    let tokenUsage: { input: number; output: number } | null = null;
    let logId: number | null = null;

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          // Send log_id as soon as the DB insert resolves (non-blocking)
          Promise.resolve(logPromise).then(({ data: logRow }) => {
            logId = logRow?.id ?? null;
            if (logId) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ log_id: logId })}\n\n`
                )
              );
            }
          }).catch(() => { /* non-critical */ });

          for await (const chunk of stream) {
            // Extract text content from AIMessageChunk
            const content = chunk.content;
            let textPart = "";
            if (typeof content === "string") {
              textPart = content;
            } else if (Array.isArray(content)) {
              for (const part of content) {
                if (typeof part === "string") {
                  textPart += part;
                } else if (part && typeof part === "object" && "text" in part) {
                  textPart += (part as { text: string }).text;
                }
              }
            }

            if (textPart) {
              fullAnswer += textPart;
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ text: textPart })}\n\n`
                )
              );
            }

            // Check for usage metadata on chunks
            const usage = (chunk as unknown as Record<string, unknown>).usage_metadata as
              | { input_tokens?: number; output_tokens?: number }
              | undefined;
            if (usage && (usage.input_tokens || usage.output_tokens)) {
              tokenUsage = {
                input: usage.input_tokens ?? 0,
                output: usage.output_tokens ?? 0,
              };
            }
          }

          // Send token usage before DONE if available
          if (tokenUsage) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ tokens: tokenUsage })}\n\n`
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

          // Populate cache for future identical requests
          askCache.set(cacheKey, { answer: fullAnswer, tokens: tokenUsage });
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
