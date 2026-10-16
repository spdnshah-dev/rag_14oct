import { del, get } from "@vercel/blob";
import { chunkPages } from "@/lib/chunk";
import { describeError, logError, step } from "@/lib/errors";
import { extractPages, hasReadableText } from "@/lib/extract";
import { BLOB_ACCESS, MAX_FILE_BYTES, checkFile, getExtension, isUuid } from "@/lib/files";
import type { FileItem } from "@/lib/types";
import {
  deleteChunks,
  deleteFile,
  saveFileRecord,
  upsertChunks,
  waitForIndexing,
} from "@/lib/vector";

export const runtime = "nodejs";
// Highest limit on the Vercel Hobby plan.
export const maxDuration = 300;

// Leave time to clean up before Vercel stops the function.
const SAFETY_MARGIN_MS = 20_000;
// Guards the free-tier index limits; about 3.6 million characters of text.
const MAX_CHUNKS_PER_FILE = 3000;

type IngestBody = {
  blobUrl?: unknown;
  fileName?: unknown;
  sizeBytes?: unknown;
  appFileId?: unknown;
  replaceAppFileId?: unknown;
};

function isBlobUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

// "reason" is shown to the user; "detail" names the failing step for diagnosis.
const processingFailed = (detail: string, reason?: "no_text" | "too_much_text") =>
  Response.json({ error: "processing_failed", reason, detail }, { status: 422 });

export async function POST(request: Request) {
  const deadline = Date.now() + maxDuration * 1000 - SAFETY_MARGIN_MS;

  let body: IngestBody;
  try {
    body = (await request.json()) as IngestBody;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const { blobUrl, fileName, sizeBytes, appFileId, replaceAppFileId } = body;
  if (!isBlobUrl(blobUrl)) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  let chunksWritten = false;
  let succeeded = false;
  try {
    if (
      typeof fileName !== "string" ||
      typeof sizeBytes !== "number" ||
      !isUuid(appFileId) ||
      (replaceAppFileId !== undefined && !isUuid(replaceAppFileId))
    ) {
      return Response.json({ error: "bad_request" }, { status: 400 });
    }
    const extension = getExtension(fileName);
    if (!extension || checkFile(fileName, sizeBytes)) {
      return Response.json({ error: "bad_type_or_size" }, { status: 400 });
    }

    const blob = await step("Read upload from Blob storage", () =>
      get(blobUrl, { access: BLOB_ACCESS, useCache: false }),
    );
    if (!blob || blob.statusCode !== 200) {
      return processingFailed("Could not read the uploaded file from Blob storage");
    }
    const bytes = await new Response(blob.stream).arrayBuffer();
    if (bytes.byteLength > MAX_FILE_BYTES) {
      return Response.json({ error: "bad_type_or_size" }, { status: 400 });
    }

    const pages = await step("Read text from file", () => extractPages(bytes, extension));
    if (!hasReadableText(pages)) return processingFailed("No readable text found", "no_text");
    const chunks = chunkPages(pages);
    if (chunks.length > MAX_CHUNKS_PER_FILE) {
      return processingFailed(`${chunks.length} passages; the limit is ${MAX_CHUNKS_PER_FILE}`, "too_much_text");
    }

    chunksWritten = true;
    await step("Index passages", () => upsertChunks(appFileId, fileName, chunks));
    const indexed = await step("Wait for indexing", () => waitForIndexing(deadline));
    if (!indexed) return Response.json({ error: "timeout" }, { status: 504 });

    const file: FileItem = {
      appFileId,
      name: fileName,
      extension,
      sizeBytes: bytes.byteLength,
      uploadedAt: Math.floor(Date.now() / 1000),
      status: "ready",
    };
    await step("Save file record", () => saveFileRecord(file, chunks.length));
    succeeded = true;

    if (replaceAppFileId && replaceAppFileId !== appFileId) {
      await deleteFile(replaceAppFileId).catch((error) => logError("ingest-replace-delete", error));
    }
    return Response.json({ file });
  } catch (error) {
    logError("ingest", error);
    return processingFailed(describeError(error));
  } finally {
    // Never leave half-indexed passages behind.
    if (chunksWritten && !succeeded && isUuid(appFileId)) {
      await deleteChunks(appFileId).catch((error) => logError("ingest-cleanup", error));
    }
    await del(blobUrl).catch((error) => logError("ingest-blob-delete", error));
  }
}
