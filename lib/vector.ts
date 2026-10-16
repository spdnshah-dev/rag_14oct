import "server-only";
import { Index } from "@upstash/vector";
import type { Chunk } from "./chunk";
import { sleep } from "./errors";
import { getExtension } from "./files";
import type { FileItem } from "./types";

// One Upstash Vector index with an Upstash-hosted embedding model holds:
// - namespace "chunks": one vector per passage, id "<appFileId>:<n>"
// - namespace "files":  one record per file (the file list), id "<appFileId>"
// A file appears in the list only after all its passages are indexed.

const CHUNKS = "chunks";
const FILES = "files";
const UPSERT_BATCH = 100;

type ChunkMetadata = { appFileId: string; fileName: string; page?: number; chunk: number };
type FileMetadata = {
  appFileId: string;
  name: string;
  sizeBytes: number;
  uploadedAt: number;
  chunkCount: number;
};

export type Passage = { id: string; file: string; page: number | null; text: string };

let client: Index | null = null;

function vectorIndex(): Index {
  if (!client) {
    const url = process.env.UPSTASH_VECTOR_REST_URL;
    const token = process.env.UPSTASH_VECTOR_REST_TOKEN;
    if (!url || !token) throw new Error("UPSTASH_VECTOR_REST_URL or UPSTASH_VECTOR_REST_TOKEN is not set");
    client = new Index({ url, token });
  }
  return client;
}

export async function indexInfo() {
  return vectorIndex().info();
}

export async function upsertChunks(appFileId: string, fileName: string, chunks: Chunk[]) {
  const index = vectorIndex();
  for (let i = 0; i < chunks.length; i += UPSERT_BATCH) {
    const batch = chunks.slice(i, i + UPSERT_BATCH).map((c) => ({
      id: `${appFileId}:${c.index}`,
      data: c.text,
      metadata: {
        appFileId,
        fileName,
        chunk: c.index,
        ...(c.page === null ? {} : { page: c.page }),
      } satisfies ChunkMetadata,
    }));
    await index.upsert(batch, { namespace: CHUNKS });
  }
}

// Upserts are indexed in the background; wait so a question asked right
// after the upload can find the new passages. Returns false on timeout.
export async function waitForIndexing(deadline: number): Promise<boolean> {
  const index = vectorIndex();
  while (Date.now() < deadline) {
    const info = await index.info();
    const pending = info.namespaces?.[CHUNKS]?.pendingVectorCount ?? info.pendingVectorCount;
    if (!pending) return true;
    await sleep(1000);
  }
  return false;
}

export async function saveFileRecord(file: FileItem, chunkCount: number) {
  await vectorIndex().upsert(
    {
      id: file.appFileId,
      data: file.name,
      metadata: {
        appFileId: file.appFileId,
        name: file.name,
        sizeBytes: file.sizeBytes,
        uploadedAt: file.uploadedAt,
        chunkCount,
      } satisfies FileMetadata,
    },
    { namespace: FILES },
  );
}

export async function listFiles(): Promise<FileItem[]> {
  const index = vectorIndex();
  const files: FileItem[] = [];
  let cursor: string | number = 0;
  const seen = new Set<string>();
  // The end-of-list cursor is not documented; also stop on an empty page or
  // a repeated cursor so this can never loop forever.
  while (true) {
    const page: Awaited<ReturnType<typeof index.range<FileMetadata>>> =
      await index.range<FileMetadata>(
        { cursor, limit: 1000, includeMetadata: true },
        { namespace: FILES },
      );
    for (const record of page.vectors) {
      const m = record.metadata;
      const extension = m && getExtension(m.name);
      if (!m || !extension) continue;
      files.push({
        appFileId: m.appFileId,
        name: m.name,
        extension,
        sizeBytes: m.sizeBytes,
        uploadedAt: m.uploadedAt,
        status: "ready",
      });
    }
    cursor = page.nextCursor;
    if (!cursor || cursor === "0" || page.vectors.length === 0 || seen.has(String(cursor))) break;
    seen.add(String(cursor));
  }
  return files.sort((a, b) => b.uploadedAt - a.uploadedAt);
}

// Removes the file from the list first, then its passages.
export async function deleteFile(appFileId: string) {
  const index = vectorIndex();
  await index.delete(appFileId, { namespace: FILES });
  await deleteChunks(appFileId);
}

export async function deleteChunks(appFileId: string) {
  await vectorIndex().delete({ prefix: `${appFileId}:` }, { namespace: CHUNKS });
}

// Hybrid (meaning + keyword) search when the index has both models;
// otherwise whatever the index supports. appFileId must be a validated UUID.
export async function searchPassages(
  query: string,
  topK: number,
  appFileId?: string,
): Promise<Passage[]> {
  const results = await vectorIndex().query<ChunkMetadata>(
    {
      data: query,
      topK,
      includeMetadata: true,
      includeData: true,
      ...(appFileId ? { filter: `appFileId = '${appFileId}'` } : {}),
    },
    { namespace: CHUNKS },
  );
  return results
    .filter((r) => r.metadata && r.data)
    .map((r) => ({
      id: String(r.id),
      file: r.metadata!.fileName,
      page: typeof r.metadata!.page === "number" ? r.metadata!.page : null,
      text: r.data!,
    }));
}
