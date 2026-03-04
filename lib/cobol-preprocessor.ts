const ABBREVIATIONS: Record<string, string> = {
  // COBOL language abbreviations
  FD: "FD File Description",
  PIC: "PIC PICTURE clause",
  WS: "WORKING-STORAGE",
  "WORKING-STORAGE": "WORKING-STORAGE SECTION data definition",
  "PROCEDURE DIVISION": "PROCEDURE DIVISION executable code",
  PERFORM: "PERFORM loop execution",
  MOVE: "MOVE data transfer statement",
  COMPUTE: "COMPUTE arithmetic statement",
  EVALUATE: "EVALUATE case/switch statement",
  INSPECT: "INSPECT string manipulation",
  UNSTRING: "UNSTRING string splitting",
  STRING: "STRING concatenation statement",
  REDEFINES: "REDEFINES memory overlay",
  OCCURS: "OCCURS array/table definition",
  COPY: "COPY copybook inclusion",
  REPLACE: "REPLACE text substitution",

  // GnuCOBOL tools
  cobc: "cobc GnuCOBOL compiler frontend",
  libcob: "libcob GnuCOBOL runtime library",
  cobcrun: "cobcrun GnuCOBOL module runner utility",

  // Common abbreviated references
  RTS: "runtime system libcob",
  BDB: "Berkeley DB indexed file",
  ISAM: "ISAM indexed sequential access method",
  MF: "Micro Focus COBOL compatibility",
  IBM: "IBM COBOL compatibility",
  BS2000: "BS2000 COBOL compatibility",
};

// Case-insensitive word boundary matching
function buildPattern(): RegExp {
  const keys = Object.keys(ABBREVIATIONS)
    .sort((a, b) => b.length - a.length) // longest first
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`\\b(${keys.join("|")})\\b`, "gi");
}

const PATTERN = buildPattern();

export function preprocessQuery(query: string): {
  normalized: string;
  wasExpanded: boolean;
} {
  let wasExpanded = false;

  const normalized = query.replace(PATTERN, (match) => {
    const key = Object.keys(ABBREVIATIONS).find(
      (k) => k.toLowerCase() === match.toLowerCase()
    );
    if (key) {
      wasExpanded = true;
      return ABBREVIATIONS[key];
    }
    return match;
  });

  return { normalized, wasExpanded };
}
