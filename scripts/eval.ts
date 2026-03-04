import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";

// Evaluation test set: queries with expected file paths that should appear in top-10
const TEST_CASES: Array<{ query: string; expectedFiles: string[] }> = [
  {
    query: "Where is the main entry point of the compiler?",
    expectedFiles: ["cobc/cobc.c"],
  },
  {
    query: "What functions handle MOVE statements?",
    expectedFiles: ["cobc/typeck.c"],
  },
  {
    query: "How does file I/O work at runtime?",
    expectedFiles: ["libcob/fileio.c"],
  },
  {
    query: "Find all PERFORM-related code",
    expectedFiles: ["cobc/parser.y", "cobc/codegen.c"],
  },
  {
    query: "How are COBOL data types defined?",
    expectedFiles: ["cobc/tree.h", "cobc/tree.c"],
  },
  {
    query: "Where is the lexical scanner?",
    expectedFiles: ["cobc/scanner.l"],
  },
  {
    query: "How does the compiler generate C code?",
    expectedFiles: ["cobc/codegen.c"],
  },
  {
    query: "What handles EVALUATE statements?",
    expectedFiles: ["cobc/parser.y"],
  },
  {
    query: "How are PICTURE clauses parsed?",
    expectedFiles: ["cobc/tree.c"],
  },
  {
    query: "Where is numeric computation handled at runtime?",
    expectedFiles: ["libcob/numeric.c"],
  },
  {
    query: "How does INSPECT statement work?",
    expectedFiles: ["libcob/intrinsic.c", "libcob/strings.c"],
  },
  {
    query: "What is the runtime common module?",
    expectedFiles: ["libcob/common.c", "libcob/common.h"],
  },
  {
    query: "How does cobcrun work?",
    expectedFiles: ["bin/cobcrun.c"],
  },
  {
    query: "Where are compiler error messages defined?",
    expectedFiles: ["cobc/error.c", "cobc/cobc.c"],
  },
  {
    query: "How does the compiler handle COPY statements?",
    expectedFiles: ["cobc/scanner.l", "cobc/pplex.l"],
  },
  {
    query: "What compiler configuration options exist?",
    expectedFiles: ["config/default.conf"],
  },
  {
    query: "Where are COBOL reserved words defined?",
    expectedFiles: ["cobc/reserved.c"],
  },
  {
    query: "How does the runtime handle screen I/O?",
    expectedFiles: ["libcob/screenio.c"],
  },
  {
    query: "Where is CALL statement resolution handled?",
    expectedFiles: ["libcob/call.c"],
  },
  {
    query: "How are compiler flags and options parsed?",
    expectedFiles: ["cobc/cobc.c"],
  },
];

async function embedQuery(text: string): Promise<number[]> {
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
  return json.data[0].embedding;
}

async function search(
  supabase: ReturnType<typeof createClient>,
  query: string
): Promise<string[]> {
  const embedding = await embedQuery(query);

  const { data, error } = await supabase.rpc("hybrid_search_code_chunks", {
    query_text: query,
    query_embedding: JSON.stringify(embedding),
    match_count: 10,
    full_text_weight: 1,
    semantic_weight: 1,
    rrf_k: 50,
  });

  if (error) throw new Error(`Search error: ${error.message}`);

  return (data || []).map(
    (r: { file_path: string }) => r.file_path
  );
}

function computeRecall(
  retrievedFiles: string[],
  expectedFiles: string[]
): number {
  const retrieved = new Set(retrievedFiles);
  const hits = expectedFiles.filter((f) => retrieved.has(f)).length;
  return hits / expectedFiles.length;
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE env vars");
    process.exit(1);
  }
  if (!process.env.VOYAGE_API_KEY) {
    console.error("Missing VOYAGE_API_KEY");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log(`Running ${TEST_CASES.length} evaluation queries...\n`);

  let totalRecall = 0;
  let passed = 0;

  for (const [i, tc] of TEST_CASES.entries()) {
    try {
      const retrievedFiles = await search(supabase, tc.query);
      const recall = computeRecall(retrievedFiles, tc.expectedFiles);
      totalRecall += recall;

      const status = recall >= 0.5 ? "PASS" : "FAIL";
      if (recall >= 0.5) passed++;

      console.log(
        `[${status}] Q${i + 1}: "${tc.query}" — recall@10: ${(recall * 100).toFixed(0)}%`
      );
      if (recall < 1) {
        const missing = tc.expectedFiles.filter(
          (f) => !retrievedFiles.includes(f)
        );
        if (missing.length > 0) {
          console.log(`       Missing: ${missing.join(", ")}`);
        }
      }

      // Rate limit: Voyage API ~300 RPM
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      console.error(`[ERROR] Q${i + 1}: "${tc.query}" — ${err}`);
    }
  }

  const avgRecall = totalRecall / TEST_CASES.length;
  console.log(`\n========================================`);
  console.log(`Results: ${passed}/${TEST_CASES.length} passed (>=50% recall)`);
  console.log(`Average recall@10: ${(avgRecall * 100).toFixed(1)}%`);
  console.log(`========================================`);

  process.exit(avgRecall >= 0.8 ? 0 : 1);
}

main();
