"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import SearchBar from "./components/SearchBar";
import Answer from "./components/Answer";
import ResultsList from "./components/ResultsList";
import ResultSkeleton from "./components/ResultSkeleton";
import ThemeToggle from "./components/ThemeToggle";
import FileTree from "./components/FileTree";
import RelatedQuestions from "./components/RelatedQuestions";
import { useSearchHistory } from "./hooks/useSearchHistory";
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
  tokenUsage: { input: number; output: number } | null;
  relatedQuestions: string[];
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
  const [tokenUsage, setTokenUsage] = useState<{ input: number; output: number } | null>(null);
  const [relatedQuestions, setRelatedQuestions] = useState<string[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const sessionId = useRef(getSessionId());
  const modeHistory = useRef<Partial<Record<AnalysisMode, ModeSnapshot>>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { history, addQuery, clearHistory } = useSearchHistory();

  // Keyboard shortcuts: / to focus search, Ctrl+K / Cmd+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        // Ctrl+K / Cmd+K works even when focused in input
        if ((e.ctrlKey || e.metaKey) && e.key === "k") {
          e.preventDefault();
          searchInputRef.current?.focus();
        }
        return;
      }
      if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Fetch related questions after answer completes
  const fetchRelatedQuestions = useCallback(async (query: string, answerText: string) => {
    setLoadingRelated(true);
    try {
      const res = await fetch("/api/related", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, answer_summary: answerText.slice(0, 500) }),
      });
      if (res.ok) {
        const data = await res.json();
        const questions: string[] = data.questions || [];
        setRelatedQuestions(questions);
        // Update mode history snapshot so cached restore includes related questions
        const snap = modeHistory.current[mode];
        if (snap && snap.query === query) {
          snap.relatedQuestions = questions;
        }
      }
    } catch {
      // Non-critical
    } finally {
      setLoadingRelated(false);
    }
  }, [mode]);

  const handleSearch = useCallback(async (query: string) => {
    // Client-side cache: if we already have a completed answer for the same query+mode+speed, restore it
    const snapshot = modeHistory.current[mode];
    if (
      snapshot &&
      snapshot.status === "done" &&
      snapshot.query === query &&
      snapshot.usedModelSpeed === modelSpeed
    ) {
      setCurrentQuery(snapshot.query);
      setAnswer(snapshot.answer);
      setResults(snapshot.results);
      setStatus("done");
      setError(snapshot.error);
      setLatency(snapshot.latency);
      setQueryLogId(snapshot.queryLogId);
      setUsedModelSpeed(snapshot.usedModelSpeed);
      setTokenUsage(snapshot.tokenUsage);
      setRelatedQuestions(snapshot.relatedQuestions);
      return;
    }

    setStatus("searching");
    setResults([]);
    setAnswer("");
    setError("");
    setLatency(null);
    setQueryLogId(null);
    setCurrentQuery(query);
    setUsedModelSpeed(modelSpeed);
    setTokenUsage(null);
    setRelatedQuestions([]);
    setLoadingRelated(false);
    addQuery(query);

    try {
      // Step 1: Search for relevant code chunks
      const searchRes = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      if (!searchRes.ok) {
        if (searchRes.status === 429) throw new Error("Rate limit reached — please wait a moment and try again.");
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
          tokenUsage: null, relatedQuestions: [],
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
          chunks: searchResults.slice(0, modelSpeed === "fast" ? 3 : 5),
          sessionId: sessionId.current,
          searchLatency,
          mode,
          modelSpeed,
        }),
      });

      if (!askRes.ok) {
        if (askRes.status === 429) throw new Error("Rate limit reached — please wait a moment and try again.");
        throw new Error("Answer generation failed");
      }

      const reader = askRes.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      const answerParts: string[] = [];
      let localQueryLogId: number | null = null;
      let localTokenUsage: { input: number; output: number } | null = null;
      let rafScheduled = false;
      let streamDone = false;

      // Batched render: accumulate chunks, flush to state on rAF
      function scheduleFlush() {
        if (rafScheduled) return;
        rafScheduled = true;
        requestAnimationFrame(() => {
          rafScheduled = false;
          setAnswer(answerParts.join(""));
        });
      }

      let remainder = "";
      let wasPartial = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = remainder + decoder.decode(value);
        const lines = text.split("\n");
        // Last element may be incomplete; save it for next iteration
        remainder = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") {
              const llmMs = Date.now() - llmStart;
              currentLatency = { ...currentLatency, llm_ms: llmMs };
              setLatency(currentLatency);
              streamDone = true;
              break;
            }
            if (data === "[PARTIAL]") {
              wasPartial = true;
              continue;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.log_id) {
                localQueryLogId = parsed.log_id;
                setQueryLogId(parsed.log_id);
              }
              if (parsed.text) {
                answerParts.push(parsed.text);
                scheduleFlush();
              }
              if (parsed.tokens) {
                localTokenUsage = parsed.tokens;
                setTokenUsage(parsed.tokens);
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
        if (streamDone) break;
      }

      // Append partial notice if the response was truncated due to timeout
      if (wasPartial) {
        answerParts.push("\n\n---\n*⚠ Response was truncated due to timeout. Try a more specific query or use fast mode.*");
      }

      // Final flush to ensure all text is rendered
      const fullAnswer = answerParts.join("");
      setAnswer(fullAnswer);
      setStatus("done");
      modeHistory.current[mode] = {
        query, answer: fullAnswer, results: searchResults, status: "done",
        error: "", latency: currentLatency, queryLogId: localQueryLogId, usedModelSpeed: modelSpeed,
        tokenUsage: localTokenUsage, relatedQuestions: [],
      };

      // Fire non-blocking related questions fetch
      fetchRelatedQuestions(query, fullAnswer);
    } catch (err) {
      console.error("Search error:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setStatus("error");
    }
  }, [mode, modelSpeed, addQuery, fetchRelatedQuestions]);

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
      tokenUsage,
      relatedQuestions,
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
      setTokenUsage(snapshot.tokenUsage ?? null);
      setRelatedQuestions(snapshot.relatedQuestions ?? []);
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
      setTokenUsage(null);
      setRelatedQuestions([]);
    }
    setMode(newMode);
  }, [mode, inputQuery, answer, results, status, error, latency, queryLogId, usedModelSpeed, tokenUsage, relatedQuestions]);

  const handleRetry = useCallback(() => {
    if (currentQuery) handleSearch(currentQuery);
  }, [currentQuery, handleSearch]);

  const handleRelatedSelect = useCallback((question: string) => {
    setInputQuery(question);
    handleSearch(question);
  }, [handleSearch]);

  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-[var(--card-border)] bg-[var(--card)] no-print">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              LegacyLens
            </h1>
            <p className="text-sm text-[var(--muted)]">
              GnuCOBOL 3.2 Codebase Explorer
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <a
              href="https://gnucobol.sourceforge.io/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors hidden sm:inline"
            >
              GnuCOBOL Project
            </a>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 max-w-5xl mx-auto w-full px-3 sm:px-4 py-8">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">
            Explore the GnuCOBOL Compiler
          </h2>
          <p className="text-[var(--muted)] text-base sm:text-lg max-w-xl mx-auto">
            Ask natural language questions about the GnuCOBOL v3.2 codebase.
            Powered by semantic search and AI.
          </p>
        </div>

        <SearchBar
          ref={searchInputRef}
          onSearch={handleSearch}
          isLoading={status === "searching" || status === "generating"}
          mode={mode}
          onModeChange={handleModeChange}
          modelSpeed={modelSpeed}
          onModelSpeedChange={setModelSpeed}
          query={inputQuery}
          onQueryChange={setInputQuery}
          searchHistory={history}
          onClearHistory={clearHistory}
        />

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
          tokenUsage={tokenUsage}
          animationKey={`${mode}-${currentQuery}`}
          onRetry={handleRetry}
        />

        {/* Related questions */}
        {status === "done" && answer && (
          <div className="w-full max-w-3xl mx-auto">
            <RelatedQuestions
              questions={relatedQuestions}
              onSelect={handleRelatedSelect}
              isLoading={loadingRelated}
            />
          </div>
        )}

        {/* File tree */}
        {results.length > 0 && <FileTree results={results} />}

        {/* Results skeleton while searching */}
        {status === "searching" && <ResultSkeleton />}

        <ResultsList results={results} animationKey={`${mode}-${currentQuery}`} />
      </div>

      {/* Footer */}
      <footer className="border-t border-[var(--card-border)] py-4 no-print">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 text-center text-sm text-[var(--muted)]">
          Built with Next.js, Supabase pgvector, Voyage Code 3, and Claude
        </div>
      </footer>
    </main>
  );
}
