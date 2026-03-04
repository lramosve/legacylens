"use client";

import CodeResult from "./CodeResult";

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

interface ResultsListProps {
  results: SearchResult[];
  animationKey?: string;
}

export default function ResultsList({ results, animationKey }: ResultsListProps) {
  if (results.length === 0) return null;

  return (
    <div className="w-full max-w-3xl mx-auto mt-6" key={animationKey}>
      <div className={animationKey ? "animate-fade-in" : ""}>
        <h2 className="text-sm font-medium text-[var(--muted)] mb-3 uppercase tracking-wider">
          Source Code ({results.length} results)
        </h2>
        <div className="space-y-3">
          {results.map((result) => (
            <div key={result.id} id={`result-${result.id}`}>
              <CodeResult
                content={result.content}
                filePath={result.file_path}
                lineStart={result.line_start}
                lineEnd={result.line_end}
                language={result.language}
                chunkType={result.chunk_type}
                functionName={result.function_name}
                score={result.score}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
