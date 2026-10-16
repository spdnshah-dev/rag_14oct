import "server-only";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import type { FileExtension } from "./files";

export type PageText = { page: number | null; text: string };

// Pulls the text out of a file. PDFs keep their page numbers; other types
// have no pages, so page is null.
export async function extractPages(bytes: ArrayBuffer, extension: FileExtension): Promise<PageText[]> {
  switch (extension) {
    case "pdf": {
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const { text } = await extractText(pdf, { mergePages: false });
      return text.map((pageText, i) => ({ page: i + 1, text: pageText }));
    }
    case "docx": {
      const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      return [{ page: null, text: value }];
    }
    case "txt":
    case "md":
      return [{ page: null, text: new TextDecoder("utf-8").decode(bytes) }];
  }
}

// Scanned PDFs (photos of pages) have no text layer.
export function hasReadableText(pages: PageText[]): boolean {
  const letters = pages.reduce((n, p) => n + (p.text.match(/[\p{L}\p{N}]/gu)?.length ?? 0), 0);
  return letters >= 20;
}
