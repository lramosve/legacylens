"use client";

import { useState, useCallback } from "react";
import SearchBar from "./components/SearchBar";
import Answer from "./components/Answer";
import ResultsList from "./components/ResultsList";

interface SearchResult {
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

type Status = "idle" | "searching" | "generating" | "done" | "error";

export default function Home() {
  const [status, setStatus] = useState<Status>("idle");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");

  const handleSearch = useCallback(async (query: string) => {
    setStatus("searching");
    setResults([]);
    setAnswer("");
    setError("");

    try {
      // Step 1: Search for relevant code chunks
      const searchRes = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      if (!searchRes.ok) {
        throw new Error("Search failed");
      }

      const { results: searchResults } = await searchRes.json();
      setResults(searchResults);

      if (searchResults.length === 0) {
        setAnswer("No relevant code found for your query. Try rephrasing or using different keywords.");
        setStatus("done");
        return;
      }

      // Step 2: Generate answer using retrieved chunks
      setStatus("generating");

      const askRes = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          chunks: searchResults.slice(0, 10), // Top 10 for context
        }),
      });

      if (!askRes.ok) {
        throw new Error("Answer generation failed");
      }

      // Stream the response
      const reader = askRes.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let fullAnswer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") {
              setStatus("done");
              break;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                fullAnswer += parsed.text;
                setAnswer(fullAnswer);
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }

      setStatus("done");
    } catch (err) {
      console.error("Search error:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setStatus("error");
    }
  }, []);

  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-[var(--card-border)] bg-[var(--card)]">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              LegacyLens
            </h1>
            <p className="text-sm text-[var(--muted)]">
              GnuCOBOL 3.2 Codebase Explorer
            </p>
          </div>
          <a
            href="https://gnucobol.sourceforge.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            GnuCOBOL Project
          </a>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 max-w-5xl mx-auto w-full px-4 py-8">
        {/* Hero (only when idle) */}
        {status === "idle" && (
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-3">
              Explore the GnuCOBOL Compiler
            </h2>
            <p className="text-[var(--muted)] text-lg max-w-xl mx-auto">
              Ask natural language questions about the GnuCOBOL v3.2 codebase.
              Powered by semantic search and AI.
            </p>
          </div>
        )}

        <SearchBar onSearch={handleSearch} isLoading={status === "searching" || status === "generating"} />

        <Answer
          text={answer}
          isStreaming={status === "generating"}
          status={status}
          error={error}
        />

        <ResultsList results={results} />
      </div>

      {/* Footer */}
      <footer className="border-t border-[var(--card-border)] py-4">
        <div className="max-w-5xl mx-auto px-4 text-center text-sm text-[var(--muted)]">
          Built with Next.js, Supabase pgvector, Voyage Code 3, and Claude
        </div>
      </footer>
    </main>
  );
}
