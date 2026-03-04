"use client";

import { useState } from "react";

interface FeedbackWidgetProps {
  queryLogId: number | null;
  queryRaw: string;
  sessionId: string | null;
}

export default function FeedbackWidget({
  queryLogId,
  queryRaw,
  sessionId,
}: FeedbackWidgetProps) {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleFeedback(isPositive: boolean) {
    if (submitted || submitting) return;
    setSubmitting(true);

    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query_log_id: queryLogId,
          query_raw: queryRaw,
          is_positive: isPositive,
          session_id: sessionId,
        }),
      });
      setSubmitted(true);
    } catch {
      // Silently fail — feedback is non-critical
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <span className="text-xs text-[var(--muted)]">
        Thanks for your feedback!
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[var(--muted)]">Was this helpful?</span>
      <button
        onClick={() => handleFeedback(true)}
        disabled={submitting}
        className="px-2 py-1 text-xs rounded border border-[var(--card-border)] hover:border-green-500 hover:text-green-400 transition-colors disabled:opacity-50"
      >
        Yes
      </button>
      <button
        onClick={() => handleFeedback(false)}
        disabled={submitting}
        className="px-2 py-1 text-xs rounded border border-[var(--card-border)] hover:border-red-500 hover:text-red-400 transition-colors disabled:opacity-50"
      >
        No
      </button>
    </div>
  );
}
