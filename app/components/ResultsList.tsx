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
}

export default function ResultsList({ results }: ResultsListProps) {
  if (results.length === 0) return null;

  return (
    <div className="w-full max-w-3xl mx-auto mt-6">
      <h2 className="text-sm font-medium text-[var(--muted)] mb-3 uppercase tracking-wider">
        Source Code ({results.length} results)
      </h2>
      <div className="space-y-3">
        {results.map((result) => (
          <CodeResult
            key={result.id}
            content={result.content}
            filePath={result.file_path}
            lineStart={result.line_start}
            lineEnd={result.line_end}
            language={result.language}
            chunkType={result.chunk_type}
            functionName={result.function_name}
            score={result.score}
          />
        ))}
      </div>
    </div>
  );
}
