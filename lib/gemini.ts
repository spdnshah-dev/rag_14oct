import "server-only";
import { ApiError, GoogleGenAI, type Document } from "@google/genai";
import { getExtension } from "./files";
import type { FileItem } from "./types";

export const STORE_DISPLAY_NAME = "document-qa-app";
export const DEFAULT_MODEL = "gemini-3.8-flash";

let client: GoogleGenAI | null = null;

export function gemini(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

export function modelName(): string {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

let cachedStoreName: string | null = process.env.GEMINI_FILE_SEARCH_STORE || null;

// Returns the File Search store's name, or null if it has not been created yet.
export async function findStoreName(): Promise<string | null> {
  if (cachedStoreName) return cachedStoreName;
  const found = await withRetry(async () => {
    const pager = await gemini().fileSearchStores.list();
    for await (const store of pager) {
      if (store.displayName === STORE_DISPLAY_NAME && store.name) return store.name;
    }
    return null;
  });
  if (found) cachedStoreName = found;
  return found;
}

// Only uploads create the store, so reading never leaves an empty store behind.
export async function getOrCreateStoreName(): Promise<string> {
  const existing = await findStoreName();
  if (existing) return existing;
  const store = await withRetry(() =>
    gemini().fileSearchStores.create({ config: { displayName: STORE_DISPLAY_NAME } }),
  );
  if (!store.name) throw new Error("File Search store was created without a name");
  cachedStoreName = store.name;
  return store.name;
}

export function isDocumentOfStore(documentName: string, storeName: string): boolean {
  const prefix = `${storeName}/documents/`;
  return documentName.startsWith(prefix) && !documentName.slice(prefix.length).includes("/");
}

function metadataValue(doc: Document, key: string): string | number | undefined {
  const entry = doc.customMetadata?.find((m) => m.key === key);
  return entry?.stringValue ?? entry?.numericValue;
}

// Builds a FileItem from a document's custom metadata. Returns null for
// documents this app did not create, or (when requireActive) not ready to search.
export function toFileItem(doc: Document, requireActive = true): FileItem | null {
  const appFileId = metadataValue(doc, "app_file_id");
  if (typeof appFileId !== "string" || !doc.name) return null;
  if (doc.state === "STATE_FAILED") return null;
  if (requireActive && doc.state && doc.state !== "STATE_ACTIVE") return null;
  const name = String(metadataValue(doc, "original_name") ?? doc.displayName ?? "Untitled");
  const extension = getExtension(name);
  if (!extension) return null;
  return {
    documentName: doc.name,
    appFileId,
    name,
    extension,
    sizeBytes: Number(metadataValue(doc, "size_bytes") ?? doc.sizeBytes ?? 0),
    uploadedAt: Number(metadataValue(doc, "uploaded_at") ?? 0),
    status: "ready",
  };
}

async function listDocuments(storeName: string): Promise<Document[]> {
  return withRetry(async () => {
    const pager = await gemini().fileSearchStores.documents.list({ parent: storeName });
    const docs: Document[] = [];
    for await (const doc of pager) docs.push(doc);
    return docs;
  });
}

export async function listFiles(storeName: string): Promise<FileItem[]> {
  const files: FileItem[] = [];
  for (const doc of await listDocuments(storeName)) {
    const item = toFileItem(doc);
    if (item) files.push(item);
  }
  return files.sort((a, b) => b.uploadedAt - a.uploadedAt);
}

// Finds a document by the app_file_id this app attached at import time.
export async function findDocumentByAppFileId(
  storeName: string,
  appFileId: string,
): Promise<Document | null> {
  const docs = await listDocuments(storeName);
  return docs.find((doc) => metadataValue(doc, "app_file_id") === appFileId) ?? null;
}

export function errorStatus(error: unknown): number | undefined {
  if (error instanceof ApiError) return error.status;
  if (error instanceof StepError) return error.status;
  return undefined;
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Retries calls that fail because Gemini is briefly unavailable or rate limited.
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const status = errorStatus(error);
      const transient = status === 429 || status === 500 || status === 503;
      if (!transient || attempt >= attempts) throw error;
      await sleep(1000 * attempt);
    }
  }
}

// Runs one named step, so an error says which Gemini call failed.
export async function step<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw new StepError(label, error);
  }
}

class StepError extends Error {
  status: number | undefined;
  constructor(label: string, cause: unknown) {
    super(`${label}: ${describeError(cause)}`);
    this.status = errorStatus(cause);
  }
}

// A short error description that is safe to log or show: API keys are masked.
export function describeError(error: unknown, maxLength = 300): string {
  // A StepError's message already includes the status.
  const status = error instanceof StepError ? undefined : errorStatus(error);
  const message = error instanceof Error ? error.message : String(error);
  const masked = message.replace(/AIza[0-9A-Za-z_-]+/g, "[key]").replace(/key=[^&\s"]+/gi, "key=[key]");
  return `${status ? `status=${status} ` : ""}${masked}`.slice(0, maxLength);
}

// Logs an error without request content or secrets.
export function logError(context: string, error: unknown) {
  console.error(`[${context}] ${describeError(error, 500)}`);
}
