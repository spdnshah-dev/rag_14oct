import { del, get } from "@vercel/blob";
import {
  BLOB_ACCESS,
  MAX_FILE_BYTES,
  MIME_BY_EXTENSION,
  checkFile,
  getExtension,
  isUuid,
} from "@/lib/files";
import {
  gemini,
  getOrCreateStoreName,
  isDocumentOfStore,
  logError,
  toFileItem,
} from "@/lib/gemini";

export const runtime = "nodejs";
// Highest limit on the Vercel Hobby plan.
export const maxDuration = 300;

const POLL_INTERVAL_MS = 4000;
// Leave time to clean up before Vercel stops the function.
const SAFETY_MARGIN_MS = 20_000;

type IngestBody = {
  blobUrl?: unknown;
  fileName?: unknown;
  sizeBytes?: unknown;
  appFileId?: unknown;
  replaceDocumentName?: unknown;
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const processingFailed = () => Response.json({ error: "processing_failed" }, { status: 422 });

export async function POST(request: Request) {
  const deadline = Date.now() + maxDuration * 1000 - SAFETY_MARGIN_MS;

  let body: IngestBody;
  try {
    body = (await request.json()) as IngestBody;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const { blobUrl, fileName, sizeBytes, appFileId, replaceDocumentName } = body;
  if (!isBlobUrl(blobUrl)) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    if (
      typeof fileName !== "string" ||
      typeof sizeBytes !== "number" ||
      !isUuid(appFileId) ||
      (replaceDocumentName !== undefined && typeof replaceDocumentName !== "string")
    ) {
      return Response.json({ error: "bad_request" }, { status: 400 });
    }
    const extension = getExtension(fileName);
    if (!extension || checkFile(fileName, sizeBytes)) {
      return Response.json({ error: "bad_type_or_size" }, { status: 400 });
    }

    const blob = await get(blobUrl, { access: BLOB_ACCESS, useCache: false });
    if (!blob || blob.statusCode !== 200) return processingFailed();
    const bytes = await new Response(blob.stream).arrayBuffer();
    if (bytes.byteLength > MAX_FILE_BYTES) {
      return Response.json({ error: "bad_type_or_size" }, { status: 400 });
    }

    const ai = gemini();
    const storeName = await getOrCreateStoreName();
    const mimeType = MIME_BY_EXTENSION[extension];
    const uploaded = await ai.files.upload({
      file: new Blob([bytes], { type: mimeType }),
      config: { displayName: fileName, mimeType },
    });
    if (!uploaded.name) return processingFailed();

    let operation = await ai.fileSearchStores.importFile({
      fileSearchStoreName: storeName,
      fileName: uploaded.name,
      config: {
        customMetadata: [
          { key: "app_file_id", stringValue: appFileId },
          { key: "original_name", stringValue: fileName },
          { key: "size_bytes", numericValue: bytes.byteLength },
          { key: "uploaded_at", numericValue: Math.floor(Date.now() / 1000) },
        ],
      },
    });
    while (!operation.done) {
      if (Date.now() + POLL_INTERVAL_MS > deadline) {
        return Response.json({ error: "timeout" }, { status: 504 });
      }
      await sleep(POLL_INTERVAL_MS);
      operation = await ai.operations.get({ operation });
    }
    if (operation.error) {
      logError("ingest-import", new Error(JSON.stringify(operation.error).slice(0, 300)));
      return processingFailed();
    }

    const documentName = operation.response?.documentName;
    if (!documentName) return processingFailed();
    const document = await ai.fileSearchStores.documents.get({ name: documentName });
    const file = toFileItem(document, false);
    if (!file) return processingFailed();

    if (replaceDocumentName && isDocumentOfStore(replaceDocumentName, storeName)) {
      try {
        await ai.fileSearchStores.documents.delete({
          name: replaceDocumentName,
          config: { force: true },
        });
      } catch (error) {
        logError("ingest-replace-delete", error);
      }
    }

    return Response.json({ file });
  } catch (error) {
    logError("ingest", error);
    return processingFailed();
  } finally {
    await del(blobUrl).catch((error) => logError("ingest-blob-delete", error));
  }
}
