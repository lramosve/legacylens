"use client";

import { useSyncExternalStore } from "react";

type Theme = "dark" | "light";

// Single module-level observer shared by all component instances
const listeners = new Set<() => void>();
let currentTheme: Theme = "dark";
let observerStarted = false;

function startObserver() {
  if (observerStarted || typeof document === "undefined") return;
  observerStarted = true;

  currentTheme =
    document.documentElement.getAttribute("data-theme") === "light"
      ? "light"
      : "dark";

  const observer = new MutationObserver(() => {
    const next =
      document.documentElement.getAttribute("data-theme") === "light"
        ? "light"
        : "dark";
    if (next !== currentTheme) {
      currentTheme = next;
      listeners.forEach((fn) => fn());
    }
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
}

function subscribe(callback: () => void) {
  startObserver();
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot(): Theme {
  return currentTheme;
}

function getServerSnapshot(): Theme {
  return "dark";
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
