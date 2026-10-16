import type { Source } from "./types";

export const NOT_FOUND_REPLY = "I couldn't find this in your uploaded files.";

const MAX_SOURCES = 5;
const MAX_SNIPPET_CHARS = 300;

// The shape of the parts of an Interactions API response this app reads.
type Citation = {
  type: string;
  file_name?: string;
  page_number?: number;
  source?: string;
  custom_metadata?: Record<string, unknown>;
};
type TextBlock = { type: string; text?: string; annotations?: Citation[] };
type Step = { type: string; content?: TextBlock[] };
export type InteractionLike = { steps?: Step[]; output_text?: string };

function readMetadataString(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    const s = v.string_value ?? v.stringValue;
    if (typeof s === "string") return s;
  }
  return undefined;
}

export function cutSnippet(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= MAX_SNIPPET_CHARS) return clean;
  const cut = clean.slice(0, MAX_SNIPPET_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 200 ? lastSpace : MAX_SNIPPET_CHARS)}…`;
}

export function readAnswer(interaction: InteractionLike): { answer: string; sources: Source[] } {
  const parts: string[] = [];
  const citations: Citation[] = [];
  for (const step of interaction.steps ?? []) {
    if (step.type !== "model_output") continue;
    const text = (step.content ?? [])
      .filter((block) => block.type === "text")
      .map((block) => {
        for (const a of block.annotations ?? []) {
          if (a.type === "file_citation") citations.push(a);
        }
        return block.text ?? "";
      })
      .join("");
    if (text.trim()) parts.push(text.trim());
  }

  let answer = parts.join("\n\n") || (interaction.output_text ?? "").trim();
  // Keep the fixed reply exact even if the model uses a curly apostrophe.
  if (answer.replace(/[‘’]/g, "'") === NOT_FOUND_REPLY) answer = NOT_FOUND_REPLY;

  const sources: Source[] = [];
  const seen = new Set<string>();
  for (const c of citations) {
    const file =
      readMetadataString(c.custom_metadata, "original_name") ?? c.file_name ?? "Unknown file";
    const page = typeof c.page_number === "number" ? c.page_number : null;
    const key = `${file}\u0000${page}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({ file, page, snippet: cutSnippet(c.source ?? "") });
    if (sources.length === MAX_SOURCES) break;
  }
  return { answer, sources };
}
