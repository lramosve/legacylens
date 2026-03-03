import {
  CodeChunk,
  estimateTokens,
  MIN_TOKENS,
  splitLargeChunk,
} from "./types";

// COBOL paragraph/section: starts in area A (columns 8-11), uppercase identifier ending with period
const PARAGRAPH_RE = /^.{6}\s{1,4}([A-Z][\w-]*)\.\s*$/;
// Division header
const DIVISION_RE = /^.{6}\s+(\w[\w-]*\s+DIVISION)/i;
// Section header
const SECTION_RE = /^.{6}\s+(\w[\w-]*\s+SECTION)/i;

export function chunkCobolFile(
  content: string,
  filePath: string,
  component: string
): CodeChunk[] {
  const lines = content.split("\n");
  const chunks: CodeChunk[] = [];
  let currentLines: string[] = [];
  let currentStart = 1;
  let currentName: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    const paraMatch = line.match(PARAGRAPH_RE);
    const divMatch = line.match(DIVISION_RE);
    const secMatch = line.match(SECTION_RE);
    const isBoundary = paraMatch || divMatch || secMatch;

    if (isBoundary && currentLines.length > 0) {
      const chunkContent = currentLines.join("\n");
      if (estimateTokens(chunkContent) >= MIN_TOKENS) {
        chunks.push(
          ...splitLargeChunk({
            content: chunkContent,
            file_path: filePath,
            line_start: currentStart,
            line_end: lineNum - 1,
            language: "cobol",
            chunk_type: divMatch
              ? "division"
              : secMatch
                ? "section"
                : "paragraph",
            function_name: currentName,
            component,
            metadata: {},
          })
        );
      }
      currentLines = [];
      currentStart = lineNum;
    }

    if (paraMatch) currentName = paraMatch[1];
    else if (divMatch) currentName = divMatch[1];
    else if (secMatch) currentName = secMatch[1];

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
          language: "cobol",
          chunk_type: "paragraph",
          function_name: currentName,
          component,
          metadata: {},
        })
      );
    }
  }

  return chunks;
}
