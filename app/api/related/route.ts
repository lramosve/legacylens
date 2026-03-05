import { NextRequest } from "next/server";
import { ChatAnthropic } from "@langchain/anthropic";
import { relatedLimiter, applyRateLimit } from "@/lib/rate-limit";
import { relatedBodySchema, parseBody } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const rateLimited = applyRateLimit(relatedLimiter, req);
  if (rateLimited) return rateLimited;

  try {
    const [body, validationError] = parseBody(relatedBodySchema, await req.json());
    if (validationError) return validationError;

    const { query, answer_summary } = body;

    const model = new ChatAnthropic({
      model: "claude-haiku-4-5-20251001",
      maxTokens: 256,
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const result = await model.invoke([
      {
        role: "system",
        content:
          "You generate follow-up questions for a GnuCOBOL codebase explorer. Given a user's question and an answer summary, produce exactly 3 short, specific follow-up questions. Return ONLY a JSON array of strings, no other text.",
      },
      {
        role: "user",
        content: `Original question: ${query}\n\nAnswer summary: ${(answer_summary || "").slice(0, 500)}\n\nGenerate 3 follow-up questions as a JSON array:`,
      },
    ]);

    const text = typeof result.content === "string" ? result.content : (result.content[0] as { text: string }).text;

    // Extract JSON array from response
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) {
      return Response.json({ questions: [] });
    }

    const questions: string[] = JSON.parse(match[0]);
    return Response.json({ questions: questions.slice(0, 3) });
  } catch (err) {
    console.error("Related questions error:", err);
    return Response.json({ questions: [] });
  }
}
