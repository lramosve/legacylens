"use client";

import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import FeedbackWidget from "./FeedbackWidget";
import CopyButton from "./CopyButton";
import ExportButton from "./ExportButton";
import AnswerSkeleton from "./AnswerSkeleton";
import { useTheme } from "../hooks/useTheme";
import type { AnalysisMode } from "@/lib/types";

const SyntaxHighlighter = dynamic(
  () => import("react-syntax-highlighter").then((mod) => mod.Prism),
  { ssr: false, loading: () => <div className="p-4 bg-[var(--code-bg)] rounded-lg animate-pulse h-20" /> }
);

const MODE_LABELS: Record<AnalysisMode, string> = {
  explain: "Code Explanation",
  document: "Generated Documentation",
  translate: "Translation Hints",
  "business-logic": "Business Logic Analysis",
};

const MODE_GENERATING_MSG: Record<AnalysisMode, string> = {
  explain: "Generating explanation...",
  document: "Generating documentation...",
  translate: "Generating translation hints...",
  "business-logic": "Extracting business logic...",
};

interface Latency {
  embedding_ms: number;
  search_ms: number;
  llm_ms: number | null;
}

interface AnswerProps {
  text: string;
  isStreaming: boolean;
  status: "idle" | "searching" | "generating" | "done" | "error";
  error?: string;
  latency?: Latency | null;
  queryLogId?: number | null;
  currentQuery?: string;
  sessionId?: string;
  mode?: AnalysisMode;
  modelSpeed?: "fast" | "quality";
  tokenUsage?: { input: number; output: number } | null;
  animationKey?: string;
  onRetry?: () => void;
}

export default function Answer({
  text,
  isStreaming,
  status,
  error,
  latency,
  queryLogId,
  currentQuery,
  sessionId,
  mode = "explain",
  modelSpeed = "quality",
  tokenUsage,
  animationKey,
  onRetry,
}: AnswerProps) {
  const theme = useTheme();

  if (status === "idle") return null;

  const proseClass = theme === "light"
    ? "prose max-w-none prose-pre:p-0 prose-pre:bg-transparent"
    : "prose prose-invert max-w-none prose-pre:p-0 prose-pre:bg-transparent";

  return (
    <div className="w-full max-w-3xl mx-auto mt-6">
      {/* Skeleton for searching */}
      {status === "searching" && (
        <AnswerSkeleton message="Searching the GnuCOBOL codebase..." />
      )}

      {/* Skeleton for generating (before text starts) */}
      {status === "generating" && !text && (
        <AnswerSkeleton message={MODE_GENERATING_MSG[mode]} />
      )}

      {status === "error" && (
        <div className="px-5 py-4 bg-red-950/30 border border-red-900/50 rounded-xl text-red-400">
          <p>{error || "An error occurred. Please try again."}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-3 px-4 py-1.5 text-sm bg-red-900/40 hover:bg-red-900/60 border border-red-800/50 rounded-lg transition-colors cursor-pointer"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Answer content */}
      {text && (
        <div className={animationKey ? "animate-fade-in" : ""} key={animationKey}>
          <div className="px-5 py-4 bg-[var(--card)] border border-[var(--card-border)] rounded-xl" data-answer-card>
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-medium text-[var(--accent)] uppercase tracking-wider">
                {MODE_LABELS[mode]}
              </div>
              {status === "done" && (
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(text);
                    } catch { /* ignore */ }
                  }}
                  className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors flex items-center gap-1"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copy answer
                </button>
              )}
            </div>
            <div className={proseClass}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || "");
                    const codeString = String(children).replace(/\n$/, "");

                    if (match) {
                      return (
                        <div className="relative group">
                          <CopyButton text={codeString} className="absolute top-2 right-2 z-10" />
                          <SyntaxHighlighter
                            style={theme === "light" ? oneLight : oneDark}
                            language={match[1]}
                            PreTag="div"
                            customStyle={{
                              margin: 0,
                              borderRadius: "0.5rem",
                              fontSize: "0.875rem",
                              background: "var(--code-bg)",
                            }}
                          >
                            {codeString}
                          </SyntaxHighlighter>
                        </div>
                      );
                    }

                    return (
                      <code
                        className="bg-[var(--code-bg)] px-1.5 py-0.5 rounded text-sm"
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  },
                  p({ children }) {
                    // Process citation links [Source N]
                    if (typeof children === "string") {
                      return <p>{processCitations(children)}</p>;
                    }
                    if (Array.isArray(children)) {
                      return (
                        <p>
                          {children.map((child, i) => {
                            if (typeof child === "string") {
                              return <span key={i}>{processCitations(child)}</span>;
                            }
                            return child;
                          })}
                        </p>
                      );
                    }
                    return <p>{children}</p>;
                  },
                }}
              >
                {text}
              </ReactMarkdown>
            </div>
            {isStreaming && (
              <span className="inline-block w-2 h-5 bg-[var(--accent)] animate-pulse ml-1" />
            )}

            {/* Latency display + feedback + export */}
            {status === "done" && (
              <div className="mt-4 pt-3 border-t border-[var(--card-border)]">
                {latency && (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 text-xs text-[var(--muted)] mb-3">
                    <span>
                      <strong>Search:</strong> {((latency.embedding_ms + latency.search_ms) / 1000).toFixed(2)}s
                    </span>
                    <span className="text-[var(--card-border)] hidden sm:inline">|</span>
                    <span>
                      <strong>Generation:</strong> {latency.llm_ms != null ? `${(latency.llm_ms / 1000).toFixed(2)}s` : "..."}
                    </span>
                    {tokenUsage && (
                      <>
                        <span className="text-[var(--card-border)] hidden sm:inline">|</span>
                        <span>
                          <strong>Tokens:</strong> {tokenUsage.input}&#8593; {tokenUsage.output}&#8595;
                        </span>
                      </>
                    )}
                    <span className="text-[var(--card-border)] hidden sm:inline">|</span>
                    <span className={modelSpeed === "fast" ? "text-emerald-400" : "text-violet-400"}>
                      {modelSpeed === "fast" ? "Fast" : "Quality"}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <FeedbackWidget
                    queryLogId={queryLogId ?? null}
                    queryRaw={currentQuery ?? ""}
                    sessionId={sessionId ?? null}
                  />
                  <div className="ml-auto">
                    <ExportButton markdownText={text} query={currentQuery ?? ""} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function processCitations(text: string): React.ReactNode {
  const regex = /\[Source (\d+)\]/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const sourceNum = match[1];
    parts.push(
      <button
        key={`cite-${match.index}`}
        onClick={() => {
          // Find the Nth result element and scroll to it
          const els = document.querySelectorAll("[id^='result-']");
          const idx = parseInt(sourceNum, 10) - 1;
          if (els[idx]) {
            els[idx].scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }}
        className="inline-flex items-center px-1 py-0.5 text-xs font-medium bg-[var(--accent)]/10 text-[var(--accent)] rounded hover:bg-[var(--accent)]/20 transition-colors cursor-pointer"
      >
        [Source {sourceNum}]
      </button>
    );
    lastIndex = regex.lastIndex;
  }

  if (parts.length === 0) return text;
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return <>{parts}</>;
}
