"use client";

interface RelatedQuestionsProps {
  questions: string[];
  onSelect: (question: string) => void;
  isLoading: boolean;
}

export default function RelatedQuestions({ questions, onSelect, isLoading }: RelatedQuestionsProps) {
  if (isLoading) {
    return (
      <div className="mt-4 flex items-center gap-2">
        <div className="animate-spin h-3 w-3 border-2 border-[var(--accent)] border-t-transparent rounded-full" />
        <span className="text-xs text-[var(--muted)]">Finding related questions...</span>
      </div>
    );
  }

  if (questions.length === 0) return null;

  return (
    <div className="mt-4">
      <span className="text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
        Related Questions
      </span>
      <div className="mt-2 flex flex-wrap gap-2">
        {questions.map((q) => (
          <button
            key={q}
            onClick={() => onSelect(q)}
            className="px-3 py-1.5 text-sm bg-[var(--card)] border border-[var(--card-border)] rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--accent)] transition-colors text-left"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
