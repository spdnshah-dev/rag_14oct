import type { Source } from "./types";

export const NOT_FOUND_REPLY = "I couldn't find this in your uploaded files.";

const MAX_SOURCES = 5;
const MAX_SNIPPET_CHARS = 300;
const FALLBACK_SOURCES = 3;

export type NumberedPassage = { number: number; file: string; page: number | null; text: string };

export function cutSnippet(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= MAX_SNIPPET_CHARS) return clean;
  const cut = clean.slice(0, MAX_SNIPPET_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 200 ? lastSpace : MAX_SNIPPET_CHARS)}…`;
}

const CITATION = /\s*\[(\d+(?:\s*[,;]\s*\d+)*)\]/g;

// Turns the model's reply into the answer text and the sources it cited.
// Citation markers like [2] or [1, 3] are removed from the text and mapped
// to the numbered passages that were sent to the model.
export function readAnswer(
  rawReply: string,
  passages: NumberedPassage[],
): { answer: string; sources: Source[] } {
  // Some models put their reasoning inside <think> tags in the reply.
  const reply = rawReply.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  const cited: number[] = [];
  for (const match of reply.matchAll(CITATION)) {
    for (const n of match[1].split(/[,;]/)) cited.push(Number(n.trim()));
  }
  const answer = reply
    .replace(CITATION, "")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  // Keep the fixed reply exact even if the model uses a curly apostrophe.
  if (answer.replace(/[‘’]/g, "'") === NOT_FOUND_REPLY) {
    return { answer: NOT_FOUND_REPLY, sources: [] };
  }

  const byNumber = new Map(passages.map((p) => [p.number, p]));
  let used = cited.map((n) => byNumber.get(n)).filter((p): p is NumberedPassage => Boolean(p));
  // An answer with no citations was still written from these passages.
  if (used.length === 0) used = passages.slice(0, FALLBACK_SOURCES);

  const sources: Source[] = [];
  const seen = new Set<string>();
  for (const p of used) {
    const key = `${p.file}\u0000${p.page}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({ file: p.file, page: p.page, snippet: cutSnippet(p.text) });
    if (sources.length === MAX_SOURCES) break;
  }
  return { answer, sources };
}
