import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { formatChunksAsContext, buildRawLLMChain } from "../lib/langchain";
import type { AnalysisMode, ModelSpeed } from "../lib/types";

// ── Constants ──────────────────────────────────────────────────────────

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";

const MATCH_COUNTS = [3, 5, 7, 10, 15, 20];
const CHUNK_LIMITS = [2, 3, 5, 7, 10];

const TEST_CASES: Array<{ query: string; expectedFiles: string[] }> = [
  { query: "Where is the main entry point of the compiler?", expectedFiles: ["cobc/cobc.c"] },
  { query: "What functions handle MOVE statements?", expectedFiles: ["cobc/typeck.c"] },
  { query: "How does file I/O work at runtime?", expectedFiles: ["libcob/fileio.c"] },
  { query: "Find all PERFORM-related code", expectedFiles: ["cobc/parser.y", "cobc/codegen.c"] },
  { query: "How are COBOL data types defined?", expectedFiles: ["cobc/tree.h", "cobc/tree.c"] },
  { query: "Where is the lexical scanner?", expectedFiles: ["cobc/scanner.l"] },
  { query: "How does the compiler generate C code?", expectedFiles: ["cobc/codegen.c"] },
  { query: "What handles EVALUATE statements?", expectedFiles: ["cobc/parser.y"] },
  { query: "How are PICTURE clauses parsed?", expectedFiles: ["cobc/tree.c"] },
  { query: "Where is numeric computation handled at runtime?", expectedFiles: ["libcob/numeric.c"] },
  { query: "How does INSPECT statement work?", expectedFiles: ["libcob/intrinsic.c", "libcob/strings.c"] },
  { query: "What is the runtime common module?", expectedFiles: ["libcob/common.c", "libcob/common.h"] },
  { query: "How does cobcrun work?", expectedFiles: ["bin/cobcrun.c"] },
  { query: "Where are compiler error messages defined?", expectedFiles: ["cobc/error.c", "cobc/cobc.c"] },
  { query: "How does the compiler handle COPY statements?", expectedFiles: ["cobc/scanner.l", "cobc/pplex.l"] },
  { query: "What compiler configuration options exist?", expectedFiles: ["config/default.conf"] },
  { query: "Where are COBOL reserved words defined?", expectedFiles: ["cobc/reserved.c"] },
  { query: "How does the runtime handle screen I/O?", expectedFiles: ["libcob/screenio.c"] },
  { query: "Where is CALL statement resolution handled?", expectedFiles: ["libcob/call.c"] },
  { query: "How are compiler flags and options parsed?", expectedFiles: ["cobc/cobc.c"] },
];

// ── Types ──────────────────────────────────────────────────────────────

interface RawSearchResult {
  id: number;
  content: string;
  file_path: string;
  line_start: number;
  line_end: number;
  language: string;
  chunk_type: string;
  function_name: string | null;
  score: number;
}

interface SearchRunResult {
  results: RawSearchResult[];
  search_ms: number;
}

interface LLMRunResult {
  ttft_ms: number;
  total_ms: number;
  token_input: number;
  token_output: number;
  answer: string;
}

interface SearchAggRow {
  match_count: number;
  avg_recall: number;
  avg_search_ms: number;
  delta_recall: number | null;
}

interface LLMAggRow {
  chunkLimit: number;
  avg_llm_ms: number;
  avg_tokens_in: number;
  avg_tokens_out: number;
  avg_context_chars: number;
  avg_quality: number | null;
  delta_tokens: number | null;
}

interface ElbowResult {
  elbowIndex: number;
  elbowX: number;
}

interface CLIArgs {
  thorough: boolean;
  judge: boolean;
  queries: number;
  mode: AnalysisMode;
  speed: ModelSpeed;
  searchOnly: boolean;
  llm: boolean;
}

// ── Helper Functions ───────────────────────────────────────────────────

async function embedQuery(text: string): Promise<{ embedding: number[]; embedding_ms: number }> {
  const start = Date.now();
  const res = await fetch(VOYAGE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      input: [text],
      model: "voyage-code-3",
      input_type: "query",
    }),
  });

  if (!res.ok) {
    throw new Error(`Voyage API error ${res.status}: ${await res.text()}`);
  }

  const json = await res.json();
  return {
    embedding: json.data[0].embedding,
    embedding_ms: Date.now() - start,
  };
}

async function runSearch(
  supabase: ReturnType<typeof createClient>,
  query: string,
  embedding: number[],
  matchCount: number
): Promise<SearchRunResult> {
  const start = Date.now();
  const { data, error } = await supabase.rpc("hybrid_search_code_chunks", {
    query_text: query,
    query_embedding: JSON.stringify(embedding),
    match_count: matchCount,
    full_text_weight: 1,
    semantic_weight: 1,
    rrf_k: 50,
  });

  if (error) throw new Error(`Search error: ${error.message}`);

  return {
    results: (data || []) as RawSearchResult[],
    search_ms: Date.now() - start,
  };
}

function computeRecall(retrievedFiles: string[], expectedFiles: string[]): number {
  const retrieved = new Set(retrievedFiles);
  const hits = expectedFiles.filter((f) => retrieved.has(f)).length;
  return hits / expectedFiles.length;
}

async function runLLM(
  query: string,
  chunks: RawSearchResult[],
  chunkLimit: number,
  mode: AnalysisMode,
  speed: ModelSpeed
): Promise<LLMRunResult> {
  const selectedChunks = chunks.slice(0, chunkLimit);
  const context = formatChunksAsContext(selectedChunks);

  const chain = buildRawLLMChain(mode, speed);
  const stream = await chain.stream({ question: query, context });

  let ttft_ms = 0;
  let answer = "";
  let token_input = 0;
  let token_output = 0;
  const streamStart = Date.now();
  let firstChunkReceived = false;

  for await (const chunk of stream) {
    if (!firstChunkReceived) {
      ttft_ms = Date.now() - streamStart;
      firstChunkReceived = true;
    }

    const text = typeof chunk.content === "string" ? chunk.content : "";
    answer += text;

    if (chunk.usage_metadata) {
      if (chunk.usage_metadata.input_tokens) {
        token_input = chunk.usage_metadata.input_tokens;
      }
      if (chunk.usage_metadata.output_tokens) {
        token_output = chunk.usage_metadata.output_tokens;
      }
    }
  }

  const total_ms = Date.now() - streamStart;

  return { ttft_ms, total_ms, token_input, token_output, answer };
}

async function judgeAnswer(query: string, answer: string): Promise<number> {
  const model = new ChatAnthropic({
    model: "claude-haiku-4-5-20251001",
    maxTokens: 64,
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      "You are a code Q&A evaluator. Rate the answer on a 1-5 scale for correctness and completeness. Respond with ONLY a single integer 1-5.",
    ],
    [
      "human",
      "Question: {question}\n\nAnswer: {answer}\n\nRating (1-5):",
    ],
  ]);

  const chain = prompt.pipe(model);
  const result = await chain.invoke({ question: query, answer });
  const text = typeof result.content === "string" ? result.content : "";
  const match = text.match(/[1-5]/);
  return match ? parseInt(match[0], 10) : 3;
}

function findElbow(points: Array<{ x: number; y: number }>): ElbowResult {
  if (points.length < 3) {
    return { elbowIndex: 0, elbowX: points[0]?.x ?? 0 };
  }

  // Normalize x and y to [0,1]
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  const nx = xs.map((x) => (x - xMin) / xRange);
  const ny = ys.map((y) => (y - yMin) / yRange);

  // Maximum curvature via second derivative approximation
  let maxCurvature = -Infinity;
  let elbowIdx = 1;

  for (let i = 1; i < points.length - 1; i++) {
    const dx1 = nx[i] - nx[i - 1];
    const dy1 = ny[i] - ny[i - 1];
    const dx2 = nx[i + 1] - nx[i];
    const dy2 = ny[i + 1] - ny[i];

    // Curvature = |dx1*dy2 - dx2*dy1| / ((dx1^2+dy1^2)^1.5 + epsilon)
    const cross = Math.abs(dx1 * dy2 - dx2 * dy1);
    const denom = Math.pow(dx1 * dx1 + dy1 * dy1, 1.5) + 1e-10;
    const curvature = cross / denom;

    if (curvature > maxCurvature) {
      maxCurvature = curvature;
      elbowIdx = i;
    }
  }

  return { elbowIndex: elbowIdx, elbowX: points[elbowIdx].x };
}

function padRight(s: string, len: number): string {
  return s + " ".repeat(Math.max(0, len - s.length));
}

function padLeft(s: string, len: number): string {
  return " ".repeat(Math.max(0, len - s.length)) + s;
}

function printTable(
  headers: string[],
  rows: string[][],
  alignRight: boolean[] = []
): void {
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] || "").length))
  );

  const headerLine = headers
    .map((h, i) => (alignRight[i] ? padLeft(h, colWidths[i]) : padRight(h, colWidths[i])))
    .join(" │ ");
  console.log(headerLine);
  console.log(colWidths.map((w) => "─".repeat(w)).join("─┼─"));

  for (const row of rows) {
    const line = row
      .map((cell, i) =>
        alignRight[i] ? padLeft(cell, colWidths[i]) : padRight(cell, colWidths[i])
      )
      .join(" │ ");
    console.log(line);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── CLI Arg Parsing ────────────────────────────────────────────────────

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  const result: CLIArgs = {
    thorough: false,
    judge: false,
    queries: 5,
    mode: "explain",
    speed: "quality",
    searchOnly: false,
    llm: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--thorough":
        result.thorough = true;
        result.queries = 20;
        break;
      case "--judge":
        result.judge = true;
        break;
      case "--queries":
        result.queries = parseInt(args[++i], 10);
        break;
      case "--mode":
        result.mode = args[++i] as AnalysisMode;
        break;
      case "--speed":
        result.speed = args[++i] as ModelSpeed;
        break;
      case "--search-only":
        result.searchOnly = true;
        break;
      case "--llm":
        result.llm = true;
        break;
    }
  }

  // Clamp queries to available test cases
  result.queries = Math.min(result.queries, TEST_CASES.length);
  return result;
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  const cliArgs = parseArgs();

  // Validate env
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  if (!process.env.VOYAGE_API_KEY) {
    console.error("Missing VOYAGE_API_KEY");
    process.exit(1);
  }
  if ((cliArgs.llm || cliArgs.judge) && !process.env.ANTHROPIC_API_KEY) {
    console.error("Missing ANTHROPIC_API_KEY (required for --llm or --judge)");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const selectedCases = TEST_CASES.slice(0, cliArgs.queries);
  const runLLMPhase = cliArgs.llm && !cliArgs.searchOnly;

  console.log("Elbow Analysis \u2014 LegacyLens Performance Tuning");
  console.log("================================================");
  console.log(
    `Queries: ${selectedCases.length} | Mode: ${cliArgs.mode} | Speed: ${cliArgs.speed}` +
      (cliArgs.judge ? " | Judge: ON" : "") +
      (runLLMPhase ? "" : " | Search only")
  );
  console.log();

  // ── Phase 1: Search Elbow ──────────────────────────────────────────

  console.log("Phase 1: Search Elbow (match_count vs recall)");
  console.log("\u2500".repeat(50));

  // Embed all queries first (shared across match_count runs)
  const embeddings: Array<{ embedding: number[]; embedding_ms: number }> = [];
  for (const tc of selectedCases) {
    const result = await embedQuery(tc.query);
    embeddings.push(result);
    process.stdout.write(".");
    await delay(300); // Voyage rate limit
  }
  console.log(` ${embeddings.length} queries embedded`);

  const avgEmbeddingMs =
    embeddings.reduce((s, e) => s + e.embedding_ms, 0) / embeddings.length;
  console.log(`Average embedding latency: ${avgEmbeddingMs.toFixed(0)}ms\n`);

  // Store all search results for reuse in Phase 2
  // searchCache[queryIdx][matchCount] = { results, search_ms }
  const searchCache: Map<number, Map<number, SearchRunResult>> = new Map();

  const searchAgg: SearchAggRow[] = [];

  for (const mc of MATCH_COUNTS) {
    let totalRecall = 0;
    let totalSearchMs = 0;

    for (let qi = 0; qi < selectedCases.length; qi++) {
      const tc = selectedCases[qi];
      const emb = embeddings[qi];

      const sr = await runSearch(supabase, tc.query, emb.embedding, mc);

      if (!searchCache.has(qi)) searchCache.set(qi, new Map());
      searchCache.get(qi)!.set(mc, sr);

      const retrievedFiles = sr.results.map((r) => r.file_path);
      const recall = computeRecall(retrievedFiles, tc.expectedFiles);

      totalRecall += recall;
      totalSearchMs += sr.search_ms;
    }

    const avgRecall = totalRecall / selectedCases.length;
    const avgSearchMs = totalSearchMs / selectedCases.length;

    searchAgg.push({
      match_count: mc,
      avg_recall: avgRecall,
      avg_search_ms: avgSearchMs,
      delta_recall: null,
    });

    process.stdout.write(`  match_count=${mc} done\n`);
  }

  // Compute deltas
  for (let i = 1; i < searchAgg.length; i++) {
    searchAgg[i].delta_recall = searchAgg[i].avg_recall - searchAgg[i - 1].avg_recall;
  }

  // Find search elbow
  const searchElbow = findElbow(
    searchAgg.map((r) => ({ x: r.match_count, y: r.avg_recall }))
  );

  // Print search table
  console.log();
  const searchRows = searchAgg.map((r, i) => {
    const elbowMark = r.match_count === searchElbow.elbowX ? " \u25C0 elbow" : "";
    return [
      String(r.match_count),
      `${(r.avg_recall * 100).toFixed(1)}%`,
      `${r.avg_search_ms.toFixed(0)}ms`,
      r.delta_recall !== null ? `${r.delta_recall >= 0 ? "+" : ""}${(r.delta_recall * 100).toFixed(1)}%${elbowMark}` : "\u2014",
    ];
  });

  printTable(
    ["match_count", "recall@k", "search_ms", "\u0394 recall"],
    searchRows,
    [true, true, true, true]
  );

  const searchElbowRow = searchAgg[searchElbow.elbowIndex];
  console.log(
    `\n\u2192 Recommended match_count: ${searchElbowRow.match_count} (${(searchElbowRow.avg_recall * 100).toFixed(1)}% recall, ${searchElbowRow.avg_search_ms.toFixed(0)}ms avg)\n`
  );

  // ── Phase 2: LLM Elbow ────────────────────────────────────────────

  let llmAgg: LLMAggRow[] = [];
  let llmElbow: ElbowResult | null = null;
  const bestMatchCount = searchElbowRow.match_count;

  if (runLLMPhase) {
    console.log("Phase 2: LLM Elbow (chunkLimit vs latency/quality)");
    console.log("\u2500".repeat(55));

    // Filter chunk limits to those <= bestMatchCount
    const validChunkLimits = CHUNK_LIMITS.filter((cl) => cl <= bestMatchCount);

    for (const cl of validChunkLimits) {
      let totalLlmMs = 0;
      let totalTtft = 0;
      let totalTokensIn = 0;
      let totalTokensOut = 0;
      let totalContextChars = 0;
      let totalQuality = 0;
      let qualityCount = 0;

      for (let qi = 0; qi < selectedCases.length; qi++) {
        const tc = selectedCases[qi];
        // Retrieve cached search results at bestMatchCount
        const cached = searchCache.get(qi)?.get(bestMatchCount);
        if (!cached) continue;

        const chunks = cached.results;
        const context = formatChunksAsContext(chunks.slice(0, cl));
        totalContextChars += context.length;

        await delay(200); // LLM rate limit
        const llmResult = await runLLM(tc.query, chunks, cl, cliArgs.mode, cliArgs.speed);

        totalLlmMs += llmResult.total_ms;
        totalTtft += llmResult.ttft_ms;
        totalTokensIn += llmResult.token_input;
        totalTokensOut += llmResult.token_output;

        if (cliArgs.judge) {
          await delay(200);
          const score = await judgeAnswer(tc.query, llmResult.answer);
          totalQuality += score;
          qualityCount++;
        }

        process.stdout.write(".");
      }

      const n = selectedCases.length;
      llmAgg.push({
        chunkLimit: cl,
        avg_llm_ms: totalLlmMs / n,
        avg_tokens_in: totalTokensIn / n,
        avg_tokens_out: totalTokensOut / n,
        avg_context_chars: totalContextChars / n,
        avg_quality: qualityCount > 0 ? totalQuality / qualityCount : null,
        delta_tokens: null,
      });

      console.log(` chunkLimit=${cl} done`);
    }

    // Compute deltas
    for (let i = 1; i < llmAgg.length; i++) {
      llmAgg[i].delta_tokens = llmAgg[i].avg_tokens_in - llmAgg[i - 1].avg_tokens_in;
    }

    // Find LLM elbow (using tokens as the y-axis quality proxy)
    if (llmAgg.length >= 3) {
      llmElbow = findElbow(
        llmAgg.map((r) => ({ x: r.chunkLimit, y: r.avg_tokens_in }))
      );
    }

    // Print LLM table
    console.log();
    const llmHeaders = ["chunkLimit", "llm_ms", "tokens_in", "\u0394 tokens"];
    if (cliArgs.judge) llmHeaders.push("quality");

    const llmRows = llmAgg.map((r) => {
      const elbowMark = llmElbow && r.chunkLimit === llmElbow.elbowX ? " \u25C0 elbow" : "";
      const row = [
        String(r.chunkLimit),
        `${r.avg_llm_ms.toFixed(0)}ms`,
        String(Math.round(r.avg_tokens_in)),
        r.delta_tokens !== null
          ? `+${Math.round(r.delta_tokens)}${elbowMark}`
          : "\u2014",
      ];
      if (cliArgs.judge) {
        row.push(r.avg_quality !== null ? r.avg_quality.toFixed(1) : "n/a");
      }
      return row;
    });

    const llmAlign = [true, true, true, true];
    if (cliArgs.judge) llmAlign.push(true);

    printTable(llmHeaders, llmRows, llmAlign);

    if (llmElbow) {
      const llmElbowRow = llmAgg[llmElbow.elbowIndex];
      console.log(
        `\n\u2192 Recommended chunkLimit: ${llmElbowRow.chunkLimit} (${llmElbowRow.avg_llm_ms.toFixed(0)}ms avg, ~${Math.round(llmElbowRow.avg_tokens_in)} input tokens)\n`
      );
    }
  }

  // ── Write Results ──────────────────────────────────────────────────

  const outputPath = "scripts/elbow-results.json";
  const results = {
    timestamp: new Date().toISOString(),
    config: {
      queries: selectedCases.length,
      mode: cliArgs.mode,
      speed: cliArgs.speed,
      judge: cliArgs.judge,
      match_counts: MATCH_COUNTS,
      chunk_limits: CHUNK_LIMITS,
    },
    avg_embedding_ms: avgEmbeddingMs,
    search_elbow: {
      recommended_match_count: searchElbowRow.match_count,
      data: searchAgg,
    },
    llm_elbow: runLLMPhase
      ? {
          recommended_chunk_limit: llmElbow
            ? llmAgg[llmElbow.elbowIndex].chunkLimit
            : null,
          best_match_count_used: bestMatchCount,
          data: llmAgg,
        }
      : null,
  };

  const { writeFileSync } = await import("fs");
  writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`Results written to ${outputPath}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
