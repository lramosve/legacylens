export interface CodeChunk {
  content: string;
  file_path: string;
  line_start: number;
  line_end: number;
  language: string;
  chunk_type: string;
  function_name: string | null;
  component: string;
  metadata: Record<string, unknown>;
}

// Rough token estimate: ~4 chars per token for code
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export const MIN_TOKENS = 20;
export const MAX_TOKENS = 1500;
export const TARGET_TOKENS = 800;
export const OVERLAP_LINES = 3;

// Split a large chunk into smaller sub-chunks at blank line boundaries
export function splitLargeChunk(
  chunk: CodeChunk,
  maxTokens: number = MAX_TOKENS
): CodeChunk[] {
  const tokens = estimateTokens(chunk.content);
  if (tokens <= maxTokens) return [chunk];

  const lines = chunk.content.split("\n");
  const subChunks: CodeChunk[] = [];
  let currentLines: string[] = [];
  let currentStart = chunk.line_start;

  for (let i = 0; i < lines.length; i++) {
    currentLines.push(lines[i]);
    const currentTokens = estimateTokens(currentLines.join("\n"));

    // Split at blank lines when over target size, or force split at max
    const isBlankLine = lines[i].trim() === "";
    const shouldSplit =
      (isBlankLine && currentTokens > TARGET_TOKENS) ||
      currentTokens > maxTokens;

    if (shouldSplit && currentLines.length > 1) {
      const content = currentLines.join("\n");
      if (estimateTokens(content) >= MIN_TOKENS) {
        subChunks.push({
          ...chunk,
          content,
          line_start: currentStart,
          line_end: currentStart + currentLines.length - 1,
          function_name: chunk.function_name
            ? `${chunk.function_name} (part ${subChunks.length + 1})`
            : null,
        });
      }
      // Overlap: carry over last few lines
      const overlap = currentLines.slice(-OVERLAP_LINES);
      currentStart = currentStart + currentLines.length - OVERLAP_LINES;
      currentLines = [...overlap];
    }
  }

  // Final remaining lines
  if (currentLines.length > 0) {
    const content = currentLines.join("\n");
    if (estimateTokens(content) >= MIN_TOKENS) {
      subChunks.push({
        ...chunk,
        content,
        line_start: currentStart,
        line_end: chunk.line_end,
        function_name: chunk.function_name
          ? `${chunk.function_name} (part ${subChunks.length + 1})`
          : null,
      });
    }
  }

  return subChunks.length > 0 ? subChunks : [chunk];
}
