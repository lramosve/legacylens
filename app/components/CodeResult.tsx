"use client";

import { useState, useEffect } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import CopyButton from "./CopyButton";

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
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    if (current === "light") setTheme("light");

    const observer = new MutationObserver(() => {
      const t = document.documentElement.getAttribute("data-theme");
      setTheme(t === "light" ? "light" : "dark");
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const lines = content.split("\n");
  const isLong = lines.length > 25;
  const displayContent =
    isLong && !expanded ? lines.slice(0, 25).join("\n") + "\n..." : content;

  const syntaxLang = LANGUAGE_MAP[language] || "text";
  const langColor = LANGUAGE_COLORS[language] || "bg-gray-800 text-gray-300";
  const relevance = Math.round(score * 1000) / 10;

  const confidenceColor =
    relevance > 70 ? "bg-green-500" : relevance > 40 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between px-4 py-2.5 border-b border-[var(--card-border)] bg-[var(--code-bg)]">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-sm text-[var(--foreground)] truncate">
            {filePath}
            <span className="text-[var(--muted)]">
              :{lineStart}-{lineEnd}
            </span>
          </span>
          {functionName && (
            <span className="text-xs text-[var(--muted)] truncate hidden sm:inline">
              {functionName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-1 sm:mt-0">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${langColor}`}>
            {language}
          </span>
          <span className="px-2 py-0.5 rounded text-xs bg-[var(--card-border)] text-[var(--muted)]">
            {chunkType}
          </span>
          {/* Confidence bar */}
          <div className="flex items-center gap-1.5">
            <div className="w-16 h-1.5 bg-[var(--card-border)] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${confidenceColor}`}
                style={{ width: `${Math.min(relevance, 100)}%` }}
              />
            </div>
            <span className="text-xs text-[var(--success)] font-medium">
              {relevance}%
            </span>
          </div>
        </div>
      </div>

      {/* Code */}
      <div className="overflow-x-auto relative group">
        <CopyButton text={content} className="absolute top-2 right-2 z-10" />
        <SyntaxHighlighter
          language={syntaxLang}
          style={theme === "light" ? oneLight : oneDark}
          showLineNumbers
          startingLineNumber={lineStart}
          wrapLines
          lineProps={(lineNumber: number) => {
            const relLine = lineNumber - lineStart;
            if (relLine < 5) {
              return {
                style: {
                  backgroundColor: theme === "light" ? "rgba(59,130,246,0.06)" : "rgba(59,130,246,0.08)",
                },
              };
            }
            return {};
          }}
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
