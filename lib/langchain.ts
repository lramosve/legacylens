import { VoyageEmbeddings } from "@langchain/community/embeddings/voyage";
import { BaseRetriever } from "@langchain/core/retrievers";
import { Document } from "@langchain/core/documents";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { createServerClient } from "@/lib/supabase";
import type { CallbackManagerForRetrieverRun } from "@langchain/core/callbacks/manager";
import type { AnalysisMode, ModelSpeed } from "@/lib/types";

// --- Embeddings ---

export function createVoyageEmbeddings() {
  return new VoyageEmbeddings({
    apiKey: process.env.VOYAGE_API_KEY,
    modelName: "voyage-code-3",
    inputType: "query",
  });
}

// --- Hybrid Search Retriever ---

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

export class HybridSearchRetriever extends BaseRetriever {
  lc_namespace = ["legacylens", "retrievers"];

  private embeddings: VoyageEmbeddings;

  lastRawResults: RawSearchResult[] = [];
  lastEmbeddingMs = 0;
  lastSearchMs = 0;

  constructor() {
    super();
    this.embeddings = createVoyageEmbeddings();
  }

  async _getRelevantDocuments(
    query: string,
    _runManager?: CallbackManagerForRetrieverRun
  ): Promise<Document[]> {
    // Embed query
    const embedStart = Date.now();
    const queryEmbedding = await this.embeddings.embedQuery(query);
    this.lastEmbeddingMs = Date.now() - embedStart;

    // Hybrid search via Supabase RPC
    const searchStart = Date.now();
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc("hybrid_search_code_chunks", {
      query_text: query,
      query_embedding: JSON.stringify(queryEmbedding),
      match_count: 15,
      full_text_weight: 1,
      semantic_weight: 1,
      rrf_k: 50,
    });
    this.lastSearchMs = Date.now() - searchStart;

    if (error) {
      throw new Error(`Hybrid search failed: ${error.message}`);
    }

    this.lastRawResults = data || [];

    return this.lastRawResults.map(
      (r) =>
        new Document({
          pageContent: r.content,
          metadata: {
            id: r.id,
            file_path: r.file_path,
            line_start: r.line_start,
            line_end: r.line_end,
            language: r.language,
            chunk_type: r.chunk_type,
            function_name: r.function_name,
            score: r.score,
          },
        })
    );
  }
}

// --- LLM Chain ---

const BASE_CONTEXT = `GnuCOBOL architecture overview:
- **cobc/**: The COBOL compiler frontend — parses COBOL source, generates C code
- **libcob/**: The runtime library — provides runtime support for compiled COBOL programs
- **bin/**: Utility programs (cobcrun, etc.)
- **config/**: Compiler configuration files for different COBOL dialects
- **copy/**: COBOL copybooks (reusable code fragments)
- **tests/**: Test suite`;

const ANALYSIS_PROMPTS: Record<AnalysisMode, { system: string; humanTemplate: string }> = {
  explain: {
    system: `You are LegacyLens, an expert assistant for understanding the GnuCOBOL compiler codebase (v3.2). You help developers navigate and understand this large C-based COBOL compiler.

When answering questions:
1. Reference specific files and line numbers from the provided code context. Each line is prefixed with its exact line number (e.g., "9184: int") — use these numbers when citing code.
2. Explain the code's purpose and how it fits into the compiler architecture
3. Use clear, technical language appropriate for developers
4. If the code context doesn't contain enough information to fully answer, say so
5. Format code references as \`file_path:line_number\` or \`file_path:line_start-line_end\`

${BASE_CONTEXT}`,
    humanTemplate: `Question: {question}

Retrieved code context from the GnuCOBOL 3.2 codebase:

{context}

Please answer the question based on the code context above. Cite specific source files and line numbers.`,
  },

  document: {
    system: `You are LegacyLens, a documentation generator for the GnuCOBOL compiler codebase (v3.2). You produce structured, Doxygen-style technical documentation from source code.

When generating documentation:
1. For each function/module found in the context, produce structured docs including: purpose, parameters (with types and descriptions), return values, side effects, and usage patterns
2. Use consistent formatting with markdown headers and bullet lists
3. Reference exact file paths and line numbers from the provided context
4. Document any global state modifications, error conditions, and edge cases
5. If the context includes multiple related functions, document their relationships
6. Format code references as \`file_path:line_number\` or \`file_path:line_start-line_end\`

${BASE_CONTEXT}`,
    humanTemplate: `Generate structured technical documentation for the following:

Topic: {question}

Retrieved code context from the GnuCOBOL 3.2 codebase:

{context}

Produce comprehensive Doxygen-style documentation covering signatures, parameters, return values, side effects, and usage patterns. Cite specific source files and line numbers.`,
  },

  translate: {
    system: `You are LegacyLens, a code translation advisor for the GnuCOBOL compiler codebase (v3.2). You help developers understand how legacy C/COBOL patterns map to modern languages like Python, Rust, and TypeScript.

When providing translation hints:
1. Identify the core patterns and idioms in the source code
2. Provide idiomatic equivalents in Python, Rust, and TypeScript — focus on patterns, not line-by-line conversion
3. Highlight key differences in error handling, memory management, and type systems
4. Note any COBOL/C-specific patterns that have no direct modern equivalent and suggest alternative approaches
5. Reference exact file paths and line numbers from the provided context
6. Format code references as \`file_path:line_number\` or \`file_path:line_start-line_end\`

${BASE_CONTEXT}`,
    humanTemplate: `Provide translation hints for the following code/concept:

Topic: {question}

Retrieved code context from the GnuCOBOL 3.2 codebase:

{context}

Show idiomatic equivalents in Python, Rust, and TypeScript. Focus on patterns and architectural mapping rather than line-by-line conversion. Cite specific source files and line numbers.`,
  },

  "business-logic": {
    system: `You are LegacyLens, a business logic analyst for the GnuCOBOL compiler codebase (v3.2). You extract and categorize business rules and domain logic embedded in code.

When extracting business logic:
1. Identify and separate logic into categories: **Validation Rules**, **Computation Logic**, **Control Flow Rules**, and **Configuration/Constants**
2. Express each rule in plain English, independent of the implementation
3. Note any hardcoded thresholds, magic numbers, or implicit assumptions
4. Identify decision trees and conditional branches that encode business rules
5. Reference exact file paths and line numbers for each extracted rule
6. Format code references as \`file_path:line_number\` or \`file_path:line_start-line_end\`

${BASE_CONTEXT}`,
    humanTemplate: `Extract and categorize the business logic for:

Topic: {question}

Retrieved code context from the GnuCOBOL 3.2 codebase:

{context}

Categorize all extracted rules into: Validation Rules, Computation Logic, Control Flow Rules, and Configuration/Constants. Express each rule in plain English and cite specific source files and line numbers.`,
  },
};

const MODEL_MAP: Record<ModelSpeed, { model: string; maxTokens: number }> = {
  fast: { model: "claude-haiku-4-5-20251001", maxTokens: 1024 },
  quality: { model: "claude-sonnet-4-20250514", maxTokens: 2048 },
};

export function buildLLMChain(mode: AnalysisMode = "explain", modelSpeed: ModelSpeed = "quality") {
  const { system, humanTemplate } = ANALYSIS_PROMPTS[mode];
  const { model: modelName, maxTokens } = MODEL_MAP[modelSpeed];

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", system],
    ["human", humanTemplate],
  ]);

  const model = new ChatAnthropic({
    model: modelName,
    maxTokens,
    streaming: true,
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const outputParser = new StringOutputParser();

  return prompt.pipe(model).pipe(outputParser);
}

export function formatChunksAsContext(
  chunks: Array<{
    content: string;
    file_path: string;
    line_start: number;
    line_end: number;
    chunk_type: string;
    function_name: string | null;
  }>
): string {
  return chunks
    .map((chunk, i) => {
      const loc = `${chunk.file_path}:${chunk.line_start}-${chunk.line_end}`;
      const funcInfo = chunk.function_name
        ? ` (${chunk.chunk_type}: ${chunk.function_name})`
        : "";
      // Add line numbers to each line so the LLM can cite exact lines
      const numberedContent = chunk.content
        .split("\n")
        .map((line, j) => `${chunk.line_start + j}: ${line}`)
        .join("\n");
      return `--- Source ${i + 1}: ${loc}${funcInfo} ---\n${numberedContent}`;
    })
    .join("\n\n");
}
