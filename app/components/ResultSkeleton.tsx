"use client";

function SkeletonCard() {
  return (
    <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--card-border)]">
        <div className="flex items-center gap-3">
          <div className="h-3 w-40 bg-[var(--card-border)] rounded animate-pulse" />
          <div className="h-3 w-20 bg-[var(--card-border)] rounded animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-5 w-10 bg-[var(--card-border)] rounded animate-pulse" />
          <div className="h-5 w-14 bg-[var(--card-border)] rounded animate-pulse" />
        </div>
      </div>
      {/* Code lines */}
      <div className="px-4 py-3 space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <div className="h-3 w-8 bg-[var(--card-border)] rounded animate-pulse shrink-0" />
            <div
              className="h-3 bg-[var(--card-border)] rounded animate-pulse"
              style={{ width: `${60 + Math.random() * 30}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ResultSkeleton() {
  return (
    <div className="w-full max-w-3xl mx-auto mt-6">
      <div className="h-3 w-36 bg-[var(--card-border)] rounded animate-pulse mb-3" />
      <div className="space-y-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
