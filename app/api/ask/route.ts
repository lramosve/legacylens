import { NextRequest } from "next/server";

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
  similarity?: number;
}

const SYSTEM_PROMPT = `You are LegacyLens, an expert assistant for understanding the GnuCOBOL compiler codebase (v3.2). You help developers navigate and understand this large C-based COBOL compiler.

When answering questions:
1. Reference specific files and line numbers from the provided code context
2. Explain the code's purpose and how it fits into the compiler architecture
3. Use clear, technical language appropriate for developers
4. If the code context doesn't contain enough information to fully answer, say so
5. Format code references as \`file_path:line_start-line_end\`

GnuCOBOL architecture overview:
- **cobc/**: The COBOL compiler frontend — parses COBOL source, generates C code
- **libcob/**: The runtime library — provides runtime support for compiled COBOL programs
- **bin/**: Utility programs (cobcrun, etc.)
- **config/**: Compiler configuration files for different COBOL dialects
- **copy/**: COBOL copybooks (reusable code fragments)
- **tests/**: Test suite`;

function buildUserPrompt(query: string, chunks: CodeChunk[]): string {
  const contextParts = chunks.map((chunk, i) => {
    const loc = `${chunk.file_path}:${chunk.line_start}-${chunk.line_end}`;
    const funcInfo = chunk.function_name
      ? ` (${chunk.chunk_type}: ${chunk.function_name})`
      : "";
    return `--- Source ${i + 1}: ${loc}${funcInfo} ---\n${chunk.content}`;
  });

  return `Question: ${query}

Retrieved code context from the GnuCOBOL 3.2 codebase:

${contextParts.join("\n\n")}

Please answer the question based on the code context above. Cite specific source files and line numbers.`;
}

export async function POST(req: NextRequest) {
  try {
    const { query, chunks } = await req.json();

    if (!query || !chunks || !Array.isArray(chunks)) {
      return new Response(
        JSON.stringify({ error: "Missing query or chunks" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Missing ANTHROPIC_API_KEY" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Use fetch directly to avoid SDK bundling issues on Vercel
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        stream: true,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: buildUserPrompt(query, chunks),
          },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.text();
      console.error("Anthropic API error:", anthropicRes.status, errBody);
      return new Response(
        JSON.stringify({ error: "LLM request failed", details: errBody }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    // Proxy the SSE stream, extracting text deltas
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const reader = anthropicRes.body!.getReader();

    const readableStream = new ReadableStream({
      async start(controller) {
        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6).trim();
              if (data === "[DONE]" || !data) continue;

              try {
                const event = JSON.parse(data);
                if (
                  event.type === "content_block_delta" &&
                  event.delta?.type === "text_delta"
                ) {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ text: event.delta.text })}\n\n`
                    )
                  );
                }
              } catch {
                // skip non-JSON lines
              }
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
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
