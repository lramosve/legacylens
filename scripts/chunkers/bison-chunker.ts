import {
  CodeChunk,
  estimateTokens,
  MIN_TOKENS,
  splitLargeChunk,
} from "./types";

// Bison/Yacc rule: identifier at column 0 followed by colon
const RULE_START_RE = /^([a-zA-Z_]\w*)\s*:/;
// Lex rule: pattern at start of line (not whitespace, not comment)
const LEX_RULE_RE = /^([^\s{/%].*?)\s+\{/;

export function chunkBisonFile(
  content: string,
  filePath: string,
  component: string
): CodeChunk[] {
  const isLex = filePath.endsWith(".l");
  const language = isLex ? "lex" : "yacc";

  // Split on %% delimiters
  const sections = content.split(/^%%\s*$/m);

  const chunks: CodeChunk[] = [];
  let lineOffset = 0;

  for (let secIdx = 0; secIdx < sections.length; secIdx++) {
    const section = sections[secIdx];
    const sectionLines = section.split("\n");
    const sectionLabel =
      secIdx === 0
        ? "declarations"
        : secIdx === 1
          ? "rules"
          : "user_code";

    if (secIdx === 1) {
      // Rules section: split into individual grammar rules
      const ruleChunks = isLex
        ? chunkLexRules(sectionLines, filePath, component, lineOffset)
        : chunkBisonRules(sectionLines, filePath, component, lineOffset);
      chunks.push(...ruleChunks);
    } else {
      // Declarations or user code: chunk as blocks
      if (estimateTokens(section) >= MIN_TOKENS) {
        chunks.push(
          ...splitLargeChunk({
            content: section,
            file_path: filePath,
            line_start: lineOffset + 1,
            line_end: lineOffset + sectionLines.length,
            language,
            chunk_type: sectionLabel,
            function_name: null,
            component,
            metadata: { section: sectionLabel },
          })
        );
      }
    }

    lineOffset += sectionLines.length + 1; // +1 for the %% line
  }

  return chunks;
}

function chunkBisonRules(
  lines: string[],
  filePath: string,
  component: string,
  lineOffset: number
): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  let currentLines: string[] = [];
  let currentStart = 1;
  let currentRule: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(RULE_START_RE);

    if (match && currentLines.length > 0) {
      const content = currentLines.join("\n");
      if (estimateTokens(content) >= MIN_TOKENS) {
        chunks.push(
          ...splitLargeChunk({
            content,
            file_path: filePath,
            line_start: lineOffset + currentStart,
            line_end: lineOffset + i,
            language: "yacc",
            chunk_type: "grammar_rule",
            function_name: currentRule,
            component,
            metadata: {},
          })
        );
      }
      currentLines = [];
      currentStart = i + 1;
    }

    if (match) {
      currentRule = match[1];
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
          line_start: lineOffset + currentStart,
          line_end: lineOffset + lines.length,
          language: "yacc",
          chunk_type: "grammar_rule",
          function_name: currentRule,
          component,
          metadata: {},
        })
      );
    }
  }

  return chunks;
}

function chunkLexRules(
  lines: string[],
  filePath: string,
  component: string,
  lineOffset: number
): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  let currentLines: string[] = [];
  let currentStart = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isRuleStart = LEX_RULE_RE.test(line) || /^<\w+>/.test(line);

    if (
      isRuleStart &&
      currentLines.length > 0 &&
      estimateTokens(currentLines.join("\n")) > 200
    ) {
      const content = currentLines.join("\n");
      if (estimateTokens(content) >= MIN_TOKENS) {
        chunks.push(
          ...splitLargeChunk({
            content,
            file_path: filePath,
            line_start: lineOffset + currentStart,
            line_end: lineOffset + i,
            language: "lex",
            chunk_type: "lex_rules",
            function_name: null,
            component,
            metadata: {},
          })
        );
      }
      currentLines = [];
      currentStart = i + 1;
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
          line_start: lineOffset + currentStart,
          line_end: lineOffset + lines.length,
          language: "lex",
          chunk_type: "lex_rules",
          function_name: null,
          component,
          metadata: {},
        })
      );
    }
  }

  return chunks;
}
