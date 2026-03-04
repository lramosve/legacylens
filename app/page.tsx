"use client";

import { useState, useCallback, useRef } from "react";
import SearchBar from "./components/SearchBar";
import Answer from "./components/Answer";
import ResultsList from "./components/ResultsList";
import type { AnalysisMode, ModelSpeed } from "@/lib/types";

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

interface Latency {
  embedding_ms: number;
  search_ms: number;
  llm_ms: number | null;
}

type Status = "idle" | "searching" | "generating" | "done" | "error";

interface ModeSnapshot {
  query: string;
  answer: string;
  results: SearchResult[];
  status: Status;
  error: string;
  latency: Latency | null;
  queryLogId: number | null;
  usedModelSpeed: ModelSpeed;
}

function getSessionId(): string {
  if (typeof window === "undefined") return crypto.randomUUID();
  let id = sessionStorage.getItem("legacylens_session_id");
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem("legacylens_session_id", id);
  }
  return id;
}

export default function Home() {
  const [status, setStatus] = useState<Status>("idle");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [latency, setLatency] = useState<Latency | null>(null);
  const [queryLogId, setQueryLogId] = useState<number | null>(null);
  const [currentQuery, setCurrentQuery] = useState("");
  const [mode, setMode] = useState<AnalysisMode>("explain");
  const [modelSpeed, setModelSpeed] = useState<ModelSpeed>("quality");
  const [inputQuery, setInputQuery] = useState("");
  const [usedModelSpeed, setUsedModelSpeed] = useState<ModelSpeed>("quality");
  const sessionId = useRef(getSessionId());
  const modeHistory = useRef<Partial<Record<AnalysisMode, ModeSnapshot>>>({});

  const handleSearch = useCallback(async (query: string) => {
    setStatus("searching");
    setResults([]);
    setAnswer("");
    setError("");
    setLatency(null);
    setQueryLogId(null);
    setCurrentQuery(query);
    setUsedModelSpeed(modelSpeed);

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

      const {
        results: searchResults,
        latency: searchLatency,
      } = await searchRes.json();
      setResults(searchResults);
      let currentLatency: Latency = {
        embedding_ms: searchLatency?.embedding_ms ?? 0,
        search_ms: searchLatency?.search_ms ?? 0,
        llm_ms: null,
      };
      setLatency(currentLatency);

      if (searchResults.length === 0) {
        const noResultAnswer = "No relevant code found for your query. Try rephrasing or using different keywords.";
        setAnswer(noResultAnswer);
        setStatus("done");
        modeHistory.current[mode] = {
          query, answer: noResultAnswer, results: [], status: "done",
          error: "", latency: currentLatency, queryLogId: null, usedModelSpeed: modelSpeed,
        };
        return;
      }

      // Step 2: Generate answer using retrieved chunks
      setStatus("generating");
      const llmStart = Date.now();

      const askRes = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          chunks: searchResults.slice(0, 10),
          sessionId: sessionId.current,
          searchLatency,
          mode,
          modelSpeed,
        }),
      });

      if (!askRes.ok) {
        throw new Error("Answer generation failed");
      }

      const reader = askRes.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let fullAnswer = "";
      let localQueryLogId: number | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") {
              const llmMs = Date.now() - llmStart;
              currentLatency = { ...currentLatency, llm_ms: llmMs };
              setLatency(currentLatency);
              setStatus("done");
              break;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.log_id) {
                localQueryLogId = parsed.log_id;
                setQueryLogId(parsed.log_id);
              }
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
      modeHistory.current[mode] = {
        query, answer: fullAnswer, results: searchResults, status: "done",
        error: "", latency: currentLatency, queryLogId: localQueryLogId, usedModelSpeed: modelSpeed,
      };
    } catch (err) {
      console.error("Search error:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setStatus("error");
    }
  }, [mode, modelSpeed]);

  const handleModeChange = useCallback((newMode: AnalysisMode) => {
    modeHistory.current[mode] = {
      query: inputQuery,
      answer,
      results,
      status,
      error,
      latency,
      queryLogId,
      usedModelSpeed,
    };
    const snapshot = modeHistory.current[newMode];
    if (snapshot) {
      setInputQuery(snapshot.query);
      setAnswer(snapshot.answer);
      setResults(snapshot.results);
      setStatus(snapshot.status);
      setError(snapshot.error);
      setLatency(snapshot.latency);
      setQueryLogId(snapshot.queryLogId);
      setCurrentQuery(snapshot.query);
      setUsedModelSpeed(snapshot.usedModelSpeed);
    } else {
      setInputQuery("");
      setAnswer("");
      setResults([]);
      setStatus("idle");
      setError("");
      setLatency(null);
      setQueryLogId(null);
      setCurrentQuery("");
      setUsedModelSpeed("quality");
    }
    setMode(newMode);
  }, [mode, inputQuery, answer, results, status, error, latency, queryLogId, usedModelSpeed]);

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

        <SearchBar onSearch={handleSearch} isLoading={status === "searching" || status === "generating"} mode={mode} onModeChange={handleModeChange} modelSpeed={modelSpeed} onModelSpeedChange={setModelSpeed} query={inputQuery} onQueryChange={setInputQuery} />

        <Answer
          text={answer}
          isStreaming={status === "generating"}
          status={status}
          error={error}
          latency={latency}
          queryLogId={queryLogId}
          currentQuery={currentQuery}
          sessionId={sessionId.current}
          mode={mode}
          modelSpeed={usedModelSpeed}
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
