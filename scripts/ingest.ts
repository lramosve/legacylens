import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import { chunkCFile } from "./chunkers/c-chunker";
import { chunkBisonFile } from "./chunkers/bison-chunker";
import { chunkCobolFile } from "./chunkers/cobol-chunker";
import { chunkConfigFile } from "./chunkers/config-chunker";
import { CodeChunk, estimateTokens } from "./chunkers/types";

// Load .env.local
import * as dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const GNUCOBOL_URL =
  "https://ftp.gnu.org/gnu/gnucobol/gnucobol-3.2.tar.xz";
const EXTRACT_DIR = path.resolve(__dirname, "../gnucobol-3.2");
const TARBALL = path.resolve(__dirname, "../gnucobol-3.2.tar.xz");

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-code-3";
// With payment method: standard rate limits (300 RPM, 1M TPM)
const EMBED_BATCH_SIZE = 100;
const DELAY_BETWEEN_BATCHES_MS = 500;

// Files to skip (generated or too large)
const SKIP_FILES = new Set([
  "cobc/parser.c",
  "cobc/scanner.c",
  "tests/testsuite",
  "tests/testsuite.src/data_packed.at",
]);

// File extensions to process
const EXTENSIONS = new Set([
  ".c",
  ".h",
  ".y",
  ".l",
  ".cob",
  ".cbl",
  ".conf",
  ".def",
]);

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
  }
  return createClient(url, key);
}

async function embedBatch(texts: string[], maxRetries = 5): Promise<number[][]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("Missing VOYAGE_API_KEY");

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(VOYAGE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: texts,
        model: VOYAGE_MODEL,
        input_type: "document",
      }),
    });

    if (res.ok) {
      const json = await res.json();
      return json.data.map((d: { embedding: number[] }) => d.embedding);
    }

    if (res.status === 429 && attempt < maxRetries) {
      const wait = Math.min(30_000 * (attempt + 1), 120_000);
      console.log(`    Rate limited, waiting ${wait / 1000}s (attempt ${attempt + 1}/${maxRetries})...`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }

    const body = await res.text();
    throw new Error(`Voyage API error ${res.status}: ${body}`);
  }

  throw new Error("Max retries exceeded");
}

// Convert Windows path to Unix-style for shell commands
function toUnixPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^([A-Z]):/, (_, d) => `/${d.toLowerCase()}`);
}

// Download and extract GnuCOBOL source
function downloadAndExtract() {
  if (fs.existsSync(EXTRACT_DIR)) {
    console.log("GnuCOBOL source already extracted, skipping download.");
    return;
  }

  const tarballUnix = toUnixPath(TARBALL);
  const extractParent = toUnixPath(path.dirname(EXTRACT_DIR));

  if (!fs.existsSync(TARBALL)) {
    console.log("Downloading GnuCOBOL 3.2...");
    execSync(`curl -L -o "${tarballUnix}" "${GNUCOBOL_URL}"`, {
      stdio: "inherit",
    });
  }

  console.log("Extracting...");
  execSync(`tar -xf "${tarballUnix}" -C "${extractParent}"`, {
    stdio: "inherit",
  });
  console.log("Extraction complete.");
}

// Recursively find all source files
function findSourceFiles(dir: string, baseDir: string): string[] {
  const files: string[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      // Skip test data directories
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      files.push(...findSourceFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (!EXTENSIONS.has(ext)) continue;
      if (SKIP_FILES.has(relPath)) {
        console.log(`  Skipping: ${relPath}`);
        continue;
      }
      // Skip files over 500KB
      const stat = fs.statSync(fullPath);
      if (stat.size > 500_000) {
        console.log(`  Skipping large file: ${relPath} (${stat.size} bytes)`);
        continue;
      }
      files.push(fullPath);
    }
  }

  return files;
}

// Determine component from file path
function getComponent(relPath: string): string {
  if (relPath.startsWith("cobc/")) return "cobc";
  if (relPath.startsWith("libcob/")) return "libcob";
  if (relPath.startsWith("bin/")) return "bin";
  if (relPath.startsWith("config/")) return "config";
  if (relPath.startsWith("copy/")) return "copy";
  if (relPath.startsWith("tests/")) return "tests";
  if (relPath.startsWith("extras/")) return "extras";
  return "root";
}

// Chunk a file using the appropriate chunker
function chunkFile(
  filePath: string,
  baseDir: string
): CodeChunk[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const relPath = path.relative(baseDir, filePath).replace(/\\/g, "/");
  const ext = path.extname(filePath);
  const component = getComponent(relPath);

  switch (ext) {
    case ".c":
    case ".h":
      return chunkCFile(content, relPath, component);
    case ".y":
    case ".l":
      return chunkBisonFile(content, relPath, component);
    case ".cob":
    case ".cbl":
      return chunkCobolFile(content, relPath, component);
    case ".conf":
    case ".def":
      return chunkConfigFile(content, relPath, component);
    default:
      return [];
  }
}

async function main() {
  console.log("=== LegacyLens Ingestion Pipeline ===\n");

  // Step 1: Download and extract
  downloadAndExtract();

  // Step 2: Find all source files
  console.log("\nDiscovering source files...");
  const sourceFiles = findSourceFiles(EXTRACT_DIR, EXTRACT_DIR);
  console.log(`Found ${sourceFiles.length} source files.`);

  // Step 3: Chunk all files
  console.log("\nChunking files...");
  const allChunks: CodeChunk[] = [];
  for (const file of sourceFiles) {
    const relPath = path
      .relative(EXTRACT_DIR, file)
      .replace(/\\/g, "/");
    const chunks = chunkFile(file, EXTRACT_DIR);
    if (chunks.length > 0) {
      console.log(`  ${relPath}: ${chunks.length} chunks`);
      allChunks.push(...chunks);
    }
  }

  console.log(`\nTotal chunks: ${allChunks.length}`);
  const totalTokens = allChunks.reduce(
    (sum, c) => sum + estimateTokens(c.content),
    0
  );
  console.log(`Estimated total tokens: ${totalTokens.toLocaleString()}`);

  // Step 4: Generate embeddings and insert in batches
  console.log("\nGenerating embeddings and inserting into Supabase...");
  const supabase = getSupabase();

  // Clear existing data
  console.log("Clearing existing data...");
  await supabase.from("code_chunks").delete().neq("id", -1);

  let inserted = 0;
  for (let i = 0; i < allChunks.length; i += EMBED_BATCH_SIZE) {
    const batch = allChunks.slice(i, i + EMBED_BATCH_SIZE);
    const texts = batch.map((c) => c.content);

    // Rate limiting: wait between batches to stay under 3 RPM
    if (i > 0) {
      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_BATCHES_MS));
    }

    try {
      const embeddings = await embedBatch(texts);

      const rows = batch.map((chunk, j) => ({
        content: chunk.content,
        embedding: JSON.stringify(embeddings[j]),
        file_path: chunk.file_path,
        line_start: chunk.line_start,
        line_end: chunk.line_end,
        language: chunk.language,
        chunk_type: chunk.chunk_type,
        function_name: chunk.function_name,
        component: chunk.component,
        metadata: chunk.metadata,
      }));

      const { error } = await supabase.from("code_chunks").insert(rows);
      if (error) {
        console.error(`  Error inserting batch at offset ${i}:`, error.message);
      } else {
        inserted += batch.length;
        console.log(
          `  Inserted ${inserted}/${allChunks.length} chunks (${Math.round((inserted / allChunks.length) * 100)}%)`
        );
      }
    } catch (err) {
      console.error(`  Error processing batch at offset ${i}:`, err);
      // Wait and retry once
      await new Promise((r) => setTimeout(r, 30_000));
      try {
        const embeddings = await embedBatch(texts);
        const rows = batch.map((chunk, j) => ({
          content: chunk.content,
          embedding: JSON.stringify(embeddings[j]),
          file_path: chunk.file_path,
          line_start: chunk.line_start,
          line_end: chunk.line_end,
          language: chunk.language,
          chunk_type: chunk.chunk_type,
          function_name: chunk.function_name,
          component: chunk.component,
          metadata: chunk.metadata,
        }));

        const { error } = await supabase.from("code_chunks").insert(rows);
        if (error) {
          console.error(`  Retry error:`, error.message);
        } else {
          inserted += batch.length;
          console.log(
            `  [Retry] Inserted ${inserted}/${allChunks.length} chunks`
          );
        }
      } catch (retryErr) {
        console.error(`  Retry failed:`, retryErr);
      }
    }
  }

  console.log(`\n=== Ingestion Complete ===`);
  console.log(`Total chunks inserted: ${inserted}`);

  // Print summary by component
  const byComponent: Record<string, number> = {};
  const byLanguage: Record<string, number> = {};
  for (const chunk of allChunks) {
    byComponent[chunk.component] = (byComponent[chunk.component] || 0) + 1;
    byLanguage[chunk.language] = (byLanguage[chunk.language] || 0) + 1;
  }
  console.log("\nBy component:", byComponent);
  console.log("By language:", byLanguage);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
