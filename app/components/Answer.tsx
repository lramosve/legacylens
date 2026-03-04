"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import FeedbackWidget from "./FeedbackWidget";
import type { AnalysisMode } from "@/lib/types";

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
}: AnswerProps) {
  if (status === "idle") return null;

  return (
    <div className="w-full max-w-3xl mx-auto mt-6">
      {/* Status indicator */}
      {status === "searching" && (
        <div className="flex items-center gap-3 px-5 py-4 bg-[var(--card)] border border-[var(--card-border)] rounded-xl">
          <div className="animate-spin h-5 w-5 border-2 border-[var(--accent)] border-t-transparent rounded-full" />
          <span className="text-[var(--muted)]">
            Searching the GnuCOBOL codebase...
          </span>
        </div>
      )}

      {status === "generating" && !text && (
        <div className="flex items-center gap-3 px-5 py-4 bg-[var(--card)] border border-[var(--card-border)] rounded-xl">
          <div className="animate-spin h-5 w-5 border-2 border-[var(--accent)] border-t-transparent rounded-full" />
          <span className="text-[var(--muted)]">
            {MODE_GENERATING_MSG[mode]}
          </span>
        </div>
      )}

      {status === "error" && (
        <div className="px-5 py-4 bg-red-950/30 border border-red-900/50 rounded-xl text-red-400">
          {error || "An error occurred. Please try again."}
        </div>
      )}

      {/* Answer content */}
      {text && (
        <div className="px-5 py-4 bg-[var(--card)] border border-[var(--card-border)] rounded-xl">
          <div className="text-xs font-medium text-[var(--accent)] uppercase tracking-wider mb-3">
            {MODE_LABELS[mode]}
          </div>
          <div className="prose prose-invert max-w-none prose-pre:p-0 prose-pre:bg-transparent">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || "");
                  const codeString = String(children).replace(/\n$/, "");

                  if (match) {
                    return (
                      <SyntaxHighlighter
                        style={oneDark}
                        language={match[1]}
                        PreTag="div"
                        customStyle={{
                          margin: 0,
                          borderRadius: "0.5rem",
                          fontSize: "0.875rem",
                        }}
                      >
                        {codeString}
                      </SyntaxHighlighter>
                    );
                  }

                  return (
                    <code
                      className="bg-[#1e1e1e] px-1.5 py-0.5 rounded text-sm"
                      {...props}
                    >
                      {children}
                    </code>
                  );
                },
              }}
            >
              {text}
            </ReactMarkdown>
          </div>
          {isStreaming && (
            <span className="inline-block w-2 h-5 bg-[var(--accent)] animate-pulse ml-1" />
          )}

          {/* Latency display + feedback */}
          {status === "done" && (
            <div className="mt-4 pt-3 border-t border-[var(--card-border)]">
              {latency && (
                <div className="flex items-center gap-3 text-xs text-[var(--muted)] mb-3">
                  <span>
                    Search: {((latency.embedding_ms + latency.search_ms) / 1000).toFixed(2)}s
                  </span>
                  <span className="text-[var(--card-border)]">|</span>
                  <span>
                    Generation: {latency.llm_ms != null ? `${(latency.llm_ms / 1000).toFixed(2)}s` : "..."}
                  </span>
                  <span className="text-[var(--card-border)]">|</span>
                  <span className={modelSpeed === "fast" ? "text-emerald-400" : "text-violet-400"}>
                    {modelSpeed === "fast" ? "Fast" : "Quality"}
                  </span>
                </div>
              )}
              <FeedbackWidget
                queryLogId={queryLogId ?? null}
                queryRaw={currentQuery ?? ""}
                sessionId={sessionId ?? null}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
