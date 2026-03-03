"use client";

import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface CodeResultProps {
  content: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  language: string;
  chunkType: string;
  functionName: string | null;
  score: number;
}

const LANGUAGE_MAP: Record<string, string> = {
  c: "c",
  yacc: "c",
  lex: "c",
  cobol: "cobol",
  config: "ini",
};

const LANGUAGE_COLORS: Record<string, string> = {
  c: "bg-blue-900/40 text-blue-300",
  yacc: "bg-purple-900/40 text-purple-300",
  lex: "bg-purple-900/40 text-purple-300",
  cobol: "bg-green-900/40 text-green-300",
  config: "bg-yellow-900/40 text-yellow-300",
};

export default function CodeResult({
  content,
  filePath,
  lineStart,
  lineEnd,
  language,
  chunkType,
  functionName,
  score,
}: CodeResultProps) {
  const [expanded, setExpanded] = useState(false);
  const lines = content.split("\n");
  const isLong = lines.length > 25;
  const displayContent =
    isLong && !expanded ? lines.slice(0, 25).join("\n") + "\n..." : content;

  const syntaxLang = LANGUAGE_MAP[language] || "text";
  const langColor = LANGUAGE_COLORS[language] || "bg-gray-800 text-gray-300";
  const relevance = Math.round(score * 1000) / 10;

  return (
    <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--card-border)] bg-[#0d0d0d]">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-sm text-[var(--foreground)] truncate">
            {filePath}
            <span className="text-[var(--muted)]">
              :{lineStart}-{lineEnd}
            </span>
          </span>
          {functionName && (
            <span className="text-xs text-[var(--muted)] truncate">
              {functionName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${langColor}`}>
            {language}
          </span>
          <span className="px-2 py-0.5 rounded text-xs bg-[var(--card-border)] text-[var(--muted)]">
            {chunkType}
          </span>
          <span className="text-xs text-[var(--success)] font-medium">
            {relevance}%
          </span>
        </div>
      </div>

      {/* Code */}
      <div className="overflow-x-auto">
        <SyntaxHighlighter
          language={syntaxLang}
          style={oneDark}
          showLineNumbers
          startingLineNumber={lineStart}
          customStyle={{
            margin: 0,
            borderRadius: 0,
            fontSize: "0.8rem",
            background: "transparent",
          }}
          lineNumberStyle={{
            minWidth: "3em",
            color: "#555",
          }}
        >
          {displayContent}
        </SyntaxHighlighter>
      </div>

      {/* Expand button */}
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full py-2 text-sm text-[var(--accent)] hover:bg-[var(--card-border)]/30 transition-colors border-t border-[var(--card-border)]"
        >
          {expanded
            ? "Show less"
            : `Show all ${lines.length} lines`}
        </button>
      )}
    </div>
  );
}
