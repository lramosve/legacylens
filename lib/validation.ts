import { z } from "zod";

const MAX_QUERY_LENGTH = 500;
const MAX_CHUNKS = 10;
const MAX_COMMENT_LENGTH = 1000;

const codeChunkSchema = z.object({
  content: z.string(),
  file_path: z.string(),
  line_start: z.number(),
  line_end: z.number(),
  language: z.string(),
  chunk_type: z.string(),
  function_name: z.string().nullable(),
  score: z.number().optional(),
  id: z.number().optional(),
});

export const askBodySchema = z.object({
  query: z.string().min(1).max(MAX_QUERY_LENGTH),
  chunks: z.array(codeChunkSchema).min(1).max(MAX_CHUNKS),
  sessionId: z.string().max(100).nullable().optional(),
  searchLatency: z
    .object({
      embedding_ms: z.number().optional(),
      search_ms: z.number().optional(),
    })
    .nullable()
    .optional(),
  mode: z.enum(["explain", "document", "translate", "business-logic"]).optional(),
  modelSpeed: z.enum(["fast", "quality"]).optional(),
});

export const searchBodySchema = z.object({
  query: z.string().min(1).max(MAX_QUERY_LENGTH),
});

export const relatedBodySchema = z.object({
  query: z.string().min(1).max(MAX_QUERY_LENGTH),
  answer_summary: z.string().max(1000).optional(),
});

export const feedbackBodySchema = z.object({
  query_log_id: z.number().int().positive().nullable().optional(),
  query_raw: z.string().max(MAX_QUERY_LENGTH).nullable().optional(),
  is_positive: z.boolean(),
  comment: z.string().max(MAX_COMMENT_LENGTH).nullable().optional(),
  session_id: z.string().max(100).nullable().optional(),
});

/** Parse body with a Zod schema. Returns [data, null] on success or [null, Response] on failure. */
export function parseBody<T>(
  schema: z.ZodType<T>,
  body: unknown
): [T, null] | [null, Response] {
  const result = schema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return [
      null,
      new Response(JSON.stringify({ error: `Validation error: ${message}` }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    ];
  }
  return [result.data, null];
}
