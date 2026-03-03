const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-code-3";

function getApiKey(): string {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) throw new Error("Missing VOYAGE_API_KEY");
  return key;
}

async function embed(
  texts: string[],
  inputType: "document" | "query"
): Promise<number[][]> {
  const res = await fetch(VOYAGE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
      input: texts,
      model: MODEL,
      input_type: inputType,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Voyage API error ${res.status}: ${body}`);
  }

  const json = await res.json();
  return json.data.map((d: { embedding: number[] }) => d.embedding);
}

export async function embedQuery(text: string): Promise<number[]> {
  const [embedding] = await embed([text], "query");
  return embedding;
}

export async function embedDocument(text: string): Promise<number[]> {
  const [embedding] = await embed([text], "document");
  return embedding;
}

export async function embedBatch(
  texts: string[],
  inputType: "document" | "query" = "document"
): Promise<number[][]> {
  // Voyage Code 3 supports up to 128 texts per request
  const batchSize = 100;
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const embeddings = await embed(batch, inputType);
    results.push(...embeddings);
  }

  return results;
}
