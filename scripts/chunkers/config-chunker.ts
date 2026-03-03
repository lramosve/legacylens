import {
  CodeChunk,
  estimateTokens,
  MIN_TOKENS,
  splitLargeChunk,
} from "./types";

export function chunkConfigFile(
  content: string,
  filePath: string,
  component: string
): CodeChunk[] {
  const language = filePath.endsWith(".def") ? "c" : "config";
  const chunkType = filePath.endsWith(".def") ? "macro_group" : "config_section";

  const lines = content.split("\n");
  const chunks: CodeChunk[] = [];
  let currentLines: string[] = [];
  let currentStart = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Split at blank lines (section boundaries)
    if (line.trim() === "" && currentLines.length > 0) {
      const chunkContent = currentLines.join("\n");
      if (estimateTokens(chunkContent) >= MIN_TOKENS) {
        chunks.push(
          ...splitLargeChunk({
            content: chunkContent,
            file_path: filePath,
            line_start: currentStart,
            line_end: lineNum - 1,
            language,
            chunk_type: chunkType,
            function_name: null,
            component,
            metadata: {},
          })
        );
        currentLines = [];
        currentStart = lineNum + 1;
        continue;
      }
    }

    currentLines.push(line);
  }

  // Remaining
  if (currentLines.length > 0) {
    const chunkContent = currentLines.join("\n");
    if (estimateTokens(chunkContent) >= MIN_TOKENS) {
      chunks.push(
        ...splitLargeChunk({
          content: chunkContent,
          file_path: filePath,
          line_start: currentStart,
          line_end: lines.length,
          language,
          chunk_type: chunkType,
          function_name: null,
          component,
          metadata: {},
        })
      );
    }
  }

  return chunks;
}
