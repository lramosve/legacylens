"use client";

import { useState } from "react";

const EXAMPLE_QUERIES = [
  "Where is the main entry point of the GnuCOBOL compiler?",
  "What functions modify data records?",
  "Find all file I/O operations",
  "Show me error handling patterns in this codebase",
  "How does the parser handle PERFORM statements?",
  "What runtime functions support decimal arithmetic?",
];

interface SearchBarProps {
  onSearch: (query: string) => void;
  isLoading: boolean;
}

export default function SearchBar({ onSearch, isLoading }: SearchBarProps) {
  const [query, setQuery] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && !isLoading) {
      onSearch(query.trim());
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <form onSubmit={handleSubmit} className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask about the GnuCOBOL codebase..."
          className="w-full px-5 py-4 bg-[var(--card)] border border-[var(--card-border)] rounded-xl text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-colors text-lg"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !query.trim()}
          className="absolute right-3 top-1/2 -translate-y-1/2 px-5 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors"
        >
          {isLoading ? "Searching..." : "Ask"}
        </button>
      </form>

      {!isLoading && (
        <div className="mt-4 flex flex-wrap gap-2">
          {EXAMPLE_QUERIES.map((example) => (
            <button
              key={example}
              onClick={() => {
                setQuery(example);
                onSearch(example);
              }}
              className="px-3 py-1.5 text-sm bg-[var(--card)] border border-[var(--card-border)] rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--accent)] transition-colors"
            >
              {example}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
