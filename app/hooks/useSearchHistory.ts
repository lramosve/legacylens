"use client";

import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "legacylens-search-history";
const MAX_HISTORY = 20;

export function useSearchHistory() {
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setHistory(JSON.parse(stored));
    } catch {
      // Ignore parse errors
    }
  }, []);

  const addQuery = useCallback((query: string) => {
    setHistory((prev) => {
      const deduped = prev.filter((q) => q !== query);
      const next = [query, ...deduped].slice(0, MAX_HISTORY);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
  }, []);

  return { history, addQuery, clearHistory };
}
