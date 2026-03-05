"use client";

import { useState, useRef, useEffect } from "react";

interface ExportButtonProps {
  markdownText: string;
  query: string;
}

export default function ExportButton({ markdownText, query }: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const downloadMarkdown = () => {
    const blob = new Blob([markdownText], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `legacylens-${query.slice(0, 40).replace(/[^a-zA-Z0-9]/g, "-")}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setOpen(false);
  };

  const printAnswer = () => {
    setOpen(false);
    window.print();
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        aria-label="Export answer"
        aria-expanded={open}
        className="flex items-center gap-1.5 px-2 py-1 text-xs rounded border border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--accent)] transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Export
      </button>

      {open && (
        <div className="absolute bottom-full mb-1 right-0 bg-[var(--card)] border border-[var(--card-border)] rounded-lg shadow-lg overflow-hidden z-20 min-w-[160px]">
          <button
            onClick={downloadMarkdown}
            className="w-full px-3 py-2 text-xs text-left text-[var(--foreground)] hover:bg-[var(--card-border)] transition-colors flex items-center gap-2"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            Download Markdown
          </button>
          <button
            onClick={printAnswer}
            className="w-full px-3 py-2 text-xs text-left text-[var(--foreground)] hover:bg-[var(--card-border)] transition-colors flex items-center gap-2"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Print / PDF
          </button>
        </div>
      )}
    </div>
  );
}
