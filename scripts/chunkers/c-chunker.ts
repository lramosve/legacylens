import {
  CodeChunk,
  estimateTokens,
  MIN_TOKENS,
  splitLargeChunk,
} from "./types";

// Detect C function definitions: return type + function name at column 0
// Matches patterns like: `int\nfunction_name (params)` or `static void func(params)`
const FUNC_START_RE =
  /^(?:static\s+)?(?:(?:unsigned|signed|const|volatile|struct|enum|union)\s+)*\w[\w\s*]*?\b(\w+)\s*\([^)]*\)\s*(?:\/\*.*?\*\/\s*)*\{?\s*$/;

// Detect preprocessor blocks, struct/typedef/enum at column 0
const BLOCK_START_RE =
  /^(?:#\s*(?:define|ifdef|ifndef|if|elif)|typedef\s|struct\s|enum\s|union\s)/;

export function chunkCFile(
  content: string,
  filePath: string,
  component: string
): CodeChunk[] {
  const lines = content.split("\n");
  const isHeader = filePath.endsWith(".h");
  const language = "c";
  const chunks: CodeChunk[] = [];

  // For header files, use block-level chunking
  if (isHeader) {
    return chunkHeaderFile(lines, filePath, component);
  }

  // For .c files, use function-level chunking
  let currentChunkLines: string[] = [];
  let currentStart = 1;
  let currentFuncName: string | null = null;
  let braceDepth = 0;
  let inFunction = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Check if this line starts a new function definition
    if (!inFunction && braceDepth === 0) {
      const match = line.match(FUNC_START_RE);
      if (match && !line.startsWith("#") && !line.startsWith("//")) {
        // Save any accumulated preamble/non-function code
        if (currentChunkLines.length > 0) {
          const preambleContent = currentChunkLines.join("\n");
          if (estimateTokens(preambleContent) >= MIN_TOKENS) {
            chunks.push(
              ...splitLargeChunk({
                content: preambleContent,
                file_path: filePath,
                line_start: currentStart,
                line_end: lineNum - 1,
                language,
                chunk_type: "preamble",
                function_name: null,
                component,
                metadata: {},
              })
            );
          }
          currentChunkLines = [];
        }

        currentFuncName = match[1];
        currentStart = lineNum;
        inFunction = true;
      }
    }

    currentChunkLines.push(line);

    // Track brace depth
    for (const ch of line) {
      if (ch === "{") braceDepth++;
      if (ch === "}") braceDepth--;
    }

    // End of function body
    if (inFunction && braceDepth === 0 && line.includes("}")) {
      const funcContent = currentChunkLines.join("\n");
      if (estimateTokens(funcContent) >= MIN_TOKENS) {
        chunks.push(
          ...splitLargeChunk({
            content: funcContent,
            file_path: filePath,
            line_start: currentStart,
            line_end: lineNum,
            language,
            chunk_type: "function",
            function_name: currentFuncName,
            component,
            metadata: {},
          })
        );
      }
      currentChunkLines = [];
      currentStart = lineNum + 1;
      currentFuncName = null;
      inFunction = false;
    }
  }

  // Remaining content
  if (currentChunkLines.length > 0) {
    const remaining = currentChunkLines.join("\n");
    if (estimateTokens(remaining) >= MIN_TOKENS) {
      chunks.push(
        ...splitLargeChunk({
          content: remaining,
          file_path: filePath,
          line_start: currentStart,
          line_end: lines.length,
          language,
          chunk_type: inFunction ? "function" : "preamble",
          function_name: currentFuncName,
          component,
          metadata: {},
        })
      );
    }
  }

  return chunks;
}

function chunkHeaderFile(
  lines: string[],
  filePath: string,
  component: string
): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  let currentLines: string[] = [];
  let currentStart = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Start new block at significant boundaries
    const isBlockStart = BLOCK_START_RE.test(line);
    const isBlankLine = line.trim() === "";

    if (
      (isBlockStart || isBlankLine) &&
      currentLines.length > 0 &&
      estimateTokens(currentLines.join("\n")) > 200
    ) {
      const content = currentLines.join("\n");
      if (estimateTokens(content) >= MIN_TOKENS) {
        chunks.push(
          ...splitLargeChunk({
            content,
            file_path: filePath,
            line_start: currentStart,
            line_end: lineNum - 1,
            language: "c",
            chunk_type: "header_block",
            function_name: null,
            component,
            metadata: {},
          })
        );
      }
      currentLines = [];
      currentStart = lineNum;
    }

    currentLines.push(line);
  }

  if (currentLines.length > 0) {
    const content = currentLines.join("\n");
    if (estimateTokens(content) >= MIN_TOKENS) {
      chunks.push(
        ...splitLargeChunk({
          content,
          file_path: filePath,
          line_start: currentStart,
          line_end: lines.length,
          language: "c",
          chunk_type: "header_block",
          function_name: null,
          component,
          metadata: {},
        })
      );
    }
  }

  return chunks;
}
