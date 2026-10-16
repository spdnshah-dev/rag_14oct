// Splits extracted text into overlapping passages for search. Passages never
// cross a page boundary, so every passage has one exact page number.

export type Chunk = { index: number; page: number | null; text: string };

const TARGET_CHARS = 1200;
const MAX_PIECE_CHARS = 1600;
const OVERLAP_CHARS = 200;

function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Breaks text into pieces no longer than MAX_PIECE_CHARS, preferring
// paragraph, then sentence, then word boundaries.
function pieces(text: string): string[] {
  const out: string[] = [];
  for (const paragraph of text.split(/\n{2,}/)) {
    if (paragraph.length <= TARGET_CHARS) {
      out.push(paragraph);
      continue;
    }
    for (const sentence of paragraph.split(/(?<=[.!?])\s+/)) {
      if (sentence.length <= MAX_PIECE_CHARS) {
        out.push(sentence);
        continue;
      }
      let rest = sentence;
      while (rest.length > MAX_PIECE_CHARS) {
        const cut = rest.lastIndexOf(" ", MAX_PIECE_CHARS);
        const at = cut > MAX_PIECE_CHARS / 2 ? cut : MAX_PIECE_CHARS;
        out.push(rest.slice(0, at));
        rest = rest.slice(at).trimStart();
      }
      if (rest) out.push(rest);
    }
  }
  return out.filter((p) => p.trim());
}

// The last ~OVERLAP_CHARS of a passage, starting at a word boundary.
function overlapTail(text: string): string {
  if (text.length <= OVERLAP_CHARS) return text;
  const tail = text.slice(-OVERLAP_CHARS);
  const space = tail.indexOf(" ");
  return space >= 0 ? tail.slice(space + 1) : tail;
}

export function chunkPages(pages: { page: number | null; text: string }[]): Chunk[] {
  const chunks: Chunk[] = [];
  for (const { page, text } of pages) {
    const clean = normalize(text);
    if (!clean) continue;
    let current = "";
    let hasNew = false; // current holds text beyond the carried-over overlap
    for (const piece of pieces(clean)) {
      const joined = current ? `${current}\n${piece}` : piece;
      if (joined.length > TARGET_CHARS && hasNew) {
        chunks.push({ index: chunks.length, page, text: current });
        const tail = overlapTail(current);
        current = `${tail}\n${piece}`;
      } else {
        current = joined;
      }
      hasNew = true;
    }
    if (hasNew && current.trim()) chunks.push({ index: chunks.length, page, text: current });
  }
  return chunks;
}
