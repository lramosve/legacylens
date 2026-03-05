"use client";

import { forwardRef, useState, useRef, useEffect } from "react";
import type { AnalysisMode, ModelSpeed } from "@/lib/types";

const MODE_CONFIG: Record<
  AnalysisMode,
  { label: string; description: string; examples: string[] }
> = {
  explain: {
    label: "Explain",
    description: "Plain-English code explanation",
    examples: [
      "Where is the main entry point of the GnuCOBOL compiler?",
      "What functions modify data records?",
      "Find all file I/O operations",
      "Show me error handling patterns in this codebase",
      "How does the parser handle PERFORM statements?",
      "What runtime functions support decimal arithmetic?",
    ],
  },
  document: {
    label: "Document",
    description: "Generate structured documentation",
    examples: [
      "Document the cob_move function signature and behavior",
      "Generate API docs for the file I/O module",
      "Document the compiler's code generation pipeline",
      "What are the parameters and return values of cob_accept?",
      "Document the memory management functions in libcob",
      "Generate reference docs for the PERFORM statement handler",
    ],
  },
  translate: {
    label: "Translate",
    description: "Modern language equivalents",
    examples: [
      "How would the MOVE statement logic translate to Python?",
      "Show Rust equivalents for the decimal arithmetic routines",
      "Translate the file I/O patterns to TypeScript",
      "What's the modern equivalent of COBOL COPY/REPLACE?",
      "How would you rewrite the parser's token handling in Rust?",
      "Translate the PERFORM VARYING loop to Python and TypeScript",
    ],
  },
  "business-logic": {
    label: "Business Logic",
    description: "Extract business rules",
    examples: [
      "What validation rules does the compiler apply to MOVE statements?",
      "Extract the business rules for numeric field truncation",
      "What computation logic governs COMPUTE statement evaluation?",
      "Identify the control flow rules for PERFORM THRU",
      "What configuration constants control dialect behavior?",
      "Extract the validation logic for file OPEN/CLOSE sequences",
    ],
  },
};

interface SearchBarProps {
  onSearch: (query: string) => void;
  isLoading: boolean;
  mode: AnalysisMode;
  onModeChange: (mode: AnalysisMode) => void;
  modelSpeed: ModelSpeed;
  onModelSpeedChange: (speed: ModelSpeed) => void;
  query: string;
  onQueryChange: (query: string) => void;
  searchHistory?: string[];
  onClearHistory?: () => void;
}

const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(
  function SearchBar(
    { onSearch, isLoading, mode, onModeChange, modelSpeed, onModelSpeedChange, query, onQueryChange, searchHistory = [], onClearHistory },
    ref
  ) {
    const [showHistory, setShowHistory] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const internalRef = useRef<HTMLInputElement>(null);
    const inputRef = (ref as React.RefObject<HTMLInputElement>) || internalRef;

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (query.trim() && !isLoading) {
        setShowHistory(false);
        onSearch(query.trim());
      }
    };

    const filteredHistory = searchHistory.filter(
      (h) => !query || h.toLowerCase().includes(query.toLowerCase())
    );

    useEffect(() => {
      function handleClickOutside(e: MouseEvent) {
        if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
          setShowHistory(false);
        }
      }
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const examples = MODE_CONFIG[mode].examples;

    return (
      <div className="w-full max-w-3xl mx-auto">
        {/* Mode selector pill bar */}
        <div className="flex gap-2 mb-4 justify-center overflow-x-auto pb-1" role="tablist" aria-label="Analysis mode">
          {(Object.keys(MODE_CONFIG) as AnalysisMode[]).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => onModeChange(m)}
              disabled={isLoading}
              title={MODE_CONFIG[m].description}
              className={`px-4 py-1.5 text-sm rounded-full font-medium transition-colors whitespace-nowrap ${
                mode === m
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--card)] border border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--accent)]"
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {MODE_CONFIG[m].label}
            </button>
          ))}
        </div>

        {/* Speed toggle */}
        <div className="flex items-center justify-center gap-3 mb-4" role="radiogroup" aria-label="Model speed">
          <button
            role="radio"
            aria-checked={modelSpeed === "fast"}
            onClick={() => onModelSpeedChange("fast")}
            disabled={isLoading}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-md font-medium transition-colors ${
              modelSpeed === "fast"
                ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/40"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            Fast
          </button>
          <span className="text-[var(--muted)] text-xs">|</span>
          <button
            role="radio"
            aria-checked={modelSpeed === "quality"}
            onClick={() => onModelSpeedChange("quality")}
            disabled={isLoading}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-md font-medium transition-colors ${
              modelSpeed === "quality"
                ? "bg-violet-600/20 text-violet-400 border border-violet-500/40"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            Quality
          </button>
          <span className="text-[var(--muted)] text-xs">
            {modelSpeed === "fast" ? "(Haiku — faster, lighter)" : "(Sonnet — deeper analysis)"}
          </span>
        </div>

        <div ref={wrapperRef} className="relative">
          <form onSubmit={handleSubmit} className="relative">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                onQueryChange(e.target.value);
                setShowHistory(true);
              }}
              onFocus={() => setShowHistory(true)}
              placeholder="Ask about the GnuCOBOL codebase..."
              className="w-full px-5 py-4 pr-28 bg-[var(--card)] border border-[var(--card-border)] rounded-xl text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors text-base md:text-lg"
              disabled={isLoading}
            />
            {/* Keyboard shortcut hint */}
            {!query && !isLoading && (
              <kbd className="absolute right-24 top-1/2 -translate-y-1/2 hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono bg-[var(--card-border)] text-[var(--muted)] rounded border border-[var(--card-border)]">
                /
              </kbd>
            )}
            <button
              type="submit"
              disabled={isLoading || !query.trim()}
              className="absolute right-3 top-1/2 -translate-y-1/2 px-3 md:px-5 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors"
            >
              {isLoading ? "Searching..." : "Ask"}
            </button>
          </form>

          {/* Search history dropdown */}
          {showHistory && filteredHistory.length > 0 && !isLoading && (
            <div role="listbox" aria-label="Search history" className="absolute top-full mt-1 left-0 right-0 bg-[var(--card)] border border-[var(--card-border)] rounded-xl shadow-lg z-30 max-h-60 overflow-y-auto">
              <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--card-border)]">
                <span className="text-xs text-[var(--muted)]">Recent searches</span>
                {onClearHistory && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onClearHistory();
                      setShowHistory(false);
                    }}
                    className="text-xs text-[var(--muted)] hover:text-red-400 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
              {filteredHistory.slice(0, 8).map((h) => (
                <button
                  key={h}
                  role="option"
                  onClick={() => {
                    onQueryChange(h);
                    setShowHistory(false);
                    onSearch(h);
                  }}
                  className="w-full px-3 py-2 text-sm text-left text-[var(--foreground)] hover:bg-[var(--card-border)] transition-colors truncate"
                >
                  {h}
                </button>
              ))}
            </div>
          )}
        </div>

        {!isLoading && (
          <div className="mt-4 flex flex-wrap gap-2">
            {examples.slice(0, 4).map((example) => (
              <button
                key={example}
                onClick={() => {
                  onQueryChange(example);
                  onSearch(example);
                }}
                className="px-3 py-1.5 text-sm bg-[var(--card)] border border-[var(--card-border)] rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--accent)] transition-colors"
              >
                {example}
              </button>
            ))}
            <span className="hidden sm:contents">
              {examples.slice(4).map((example) => (
                <button
                  key={example}
                  onClick={() => {
                    onQueryChange(example);
                    onSearch(example);
                  }}
                  className="px-3 py-1.5 text-sm bg-[var(--card)] border border-[var(--card-border)] rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--accent)] transition-colors"
                >
                  {example}
                </button>
              ))}
            </span>
          </div>
        )}
      </div>
    );
  }
);

export default SearchBar;
