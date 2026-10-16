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
  const pager = await gemini().fileSearchStores.list();
  for await (const store of pager) {
    if (store.displayName === STORE_DISPLAY_NAME && store.name) {
      cachedStoreName = store.name;
      return store.name;
    }
  }
  return null;
}

// Only uploads create the store, so reading never leaves an empty store behind.
export async function getOrCreateStoreName(): Promise<string> {
  const existing = await findStoreName();
  if (existing) return existing;
  const store = await gemini().fileSearchStores.create({
    config: { displayName: STORE_DISPLAY_NAME },
  });
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

export async function listFiles(storeName: string): Promise<FileItem[]> {
  const pager = await gemini().fileSearchStores.documents.list({ parent: storeName });
  const files: FileItem[] = [];
  for await (const doc of pager) {
    const item = toFileItem(doc);
    if (item) files.push(item);
  }
  return files.sort((a, b) => b.uploadedAt - a.uploadedAt);
}

export function errorStatus(error: unknown): number | undefined {
  return error instanceof ApiError ? error.status : undefined;
}

// Logs an error without request content or secrets.
export function logError(context: string, error: unknown) {
  const status = errorStatus(error);
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${context}]${status ? ` status=${status}` : ""} ${message.slice(0, 500)}`);
}
