"use client";

import { useState, useMemo } from "react";

interface SearchResult {
  id: number;
  file_path: string;
  line_start: number;
  line_end: number;
  function_name: string | null;
}

interface FileTreeProps {
  results: SearchResult[];
}

interface TreeNode {
  name: string;
  path: string;
  children: Map<string, TreeNode>;
  results: SearchResult[];
}

function buildTree(results: SearchResult[]): TreeNode {
  const root: TreeNode = { name: "", path: "", children: new Map(), results: [] };

  for (const result of results) {
    const parts = result.file_path.split("/");
    let node = root;
    let currentPath = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      if (!node.children.has(part)) {
        node.children.set(part, { name: part, path: currentPath, children: new Map(), results: [] });
      }
      node = node.children.get(part)!;
      if (i === parts.length - 1) {
        node.results.push(result);
      }
    }
  }

  return root;
}

function TreeItem({ node, depth }: { node: TreeNode; depth: number }) {
  const [expanded, setExpanded] = useState(true);
  const isFile = node.results.length > 0;
  const hasChildren = node.children.size > 0;

  const scrollToResult = (id: number) => {
    const el = document.getElementById(`result-${id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div>
      <button
        onClick={() => {
          if (hasChildren) setExpanded(!expanded);
          if (isFile && node.results.length === 1) scrollToResult(node.results[0].id);
        }}
        className="flex items-center gap-1.5 w-full text-left py-0.5 hover:text-[var(--accent)] transition-colors text-xs"
        style={{ paddingLeft: `${depth * 12}px` }}
      >
        {hasChildren && !isFile ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
        ) : (
          <span className="w-3 shrink-0" />
        )}
        {isFile ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 text-[var(--accent)]">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 text-[var(--muted)]">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        )}
        <span className="truncate">{node.name}</span>
        {isFile && (
          <span className="text-[var(--muted)] ml-auto shrink-0">
            {node.results.length > 1 ? `(${node.results.length})` : ""}
          </span>
        )}
      </button>

      {expanded && isFile && node.results.length > 1 && (
        <div>
          {node.results.map((r) => (
            <button
              key={r.id}
              onClick={() => scrollToResult(r.id)}
              className="flex items-center gap-1.5 w-full text-left py-0.5 text-xs text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
              style={{ paddingLeft: `${(depth + 1) * 12 + 15}px` }}
            >
              L{r.line_start}-{r.line_end}
              {r.function_name && <span className="truncate">({r.function_name})</span>}
            </button>
          ))}
        </div>
      )}

      {expanded && hasChildren && (
        <div>
          {Array.from(node.children.values()).map((child) => (
            <TreeItem key={child.path} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FileTree({ results }: FileTreeProps) {
  const tree = useMemo(() => buildTree(results), [results]);
  const [collapsed, setCollapsed] = useState(false);

  if (results.length === 0) return null;

  return (
    <div className="w-full max-w-3xl mx-auto mt-6 bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-3">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 w-full text-left text-xs font-medium text-[var(--muted)] uppercase tracking-wider mb-1"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${collapsed ? "" : "rotate-90"}`}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
        File Tree
      </button>
      {!collapsed && (
        <div className="mt-1 max-h-48 overflow-y-auto">
          {Array.from(tree.children.values()).map((child) => (
            <TreeItem key={child.path} node={child} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}
