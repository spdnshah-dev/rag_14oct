// Type and size rules shared by the browser and the server.

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export const MIME_BY_EXTENSION = {
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

export type FileExtension = keyof typeof MIME_BY_EXTENSION;

export const ALLOWED_MIME_TYPES: string[] = Object.values(MIME_BY_EXTENSION);

export const ACCEPT_ATTRIBUTE = ".pdf,.txt,.md,.docx";

export const UNSUPPORTED_TYPE_MESSAGE =
  "This file type isn't supported. Upload PDF, TXT, Markdown or Word (.docx).";
export const TOO_BIG_MESSAGE =
  "This file is over the 10 MB limit. Split it or compress it, then try again.";
export const PROCESSING_FAILED_MESSAGE =
  "Processing failed. If this is a scanned PDF (a photo of pages), it may have no readable text. Try a text-based version.";

export function getExtension(fileName: string): FileExtension | null {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = fileName.slice(dot + 1).toLowerCase();
  return ext in MIME_BY_EXTENSION ? (ext as FileExtension) : null;
}

export type FileProblem = "unsupported_type" | "too_big";

export function checkFile(fileName: string, sizeBytes: number): FileProblem | null {
  if (!getExtension(fileName)) return "unsupported_type";
  if (sizeBytes > MAX_FILE_BYTES) return "too_big";
  return null;
}

export function problemMessage(problem: FileProblem): string {
  return problem === "too_big" ? TOO_BIG_MESSAGE : UNSUPPORTED_TYPE_MESSAGE;
}

export function formatSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

export function extensionLabel(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot < 0 ? "?" : fileName.slice(dot + 1).toUpperCase();
}

// Blob store access level. Must match how the Vercel Blob store was created.
export const BLOB_ACCESS: "public" | "private" =
  process.env.NEXT_PUBLIC_BLOB_ACCESS === "public" ? "public" : "private";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}
