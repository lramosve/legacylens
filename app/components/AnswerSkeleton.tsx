"use client";

export default function AnswerSkeleton({ message }: { message?: string }) {
  return (
    <div className="px-5 py-4 bg-[var(--card)] border border-[var(--card-border)] rounded-xl">
      {message && (
        <div className="flex items-center gap-3 mb-4">
          <div className="animate-spin h-4 w-4 border-2 border-[var(--accent)] border-t-transparent rounded-full" />
          <span className="text-sm text-[var(--muted)]">{message}</span>
        </div>
      )}
      {/* Header bar */}
      <div className="h-3 w-32 bg-[var(--card-border)] rounded animate-pulse mb-4" />
      {/* Text lines */}
      <div className="space-y-3">
        <div className="h-3 w-full bg-[var(--card-border)] rounded animate-pulse" />
        <div className="h-3 w-5/6 bg-[var(--card-border)] rounded animate-pulse" />
        <div className="h-3 w-4/5 bg-[var(--card-border)] rounded animate-pulse" />
        <div className="h-3 w-3/4 bg-[var(--card-border)] rounded animate-pulse" />
      </div>
      {/* Code block placeholder */}
      <div className="mt-4 h-24 bg-[var(--card-border)] rounded-lg animate-pulse" />
      {/* More text lines */}
      <div className="space-y-3 mt-4">
        <div className="h-3 w-full bg-[var(--card-border)] rounded animate-pulse" />
        <div className="h-3 w-2/3 bg-[var(--card-border)] rounded animate-pulse" />
      </div>
    </div>
  );
}
