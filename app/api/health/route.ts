import { issueSignedToken } from "@vercel/blob";
import { describeError, findStoreName, gemini, logError, modelName } from "@/lib/gemini";

export const runtime = "nodejs";

// Checks the env vars right after a deploy. "store: false" with ok: true
// means no file has been uploaded yet, so the Gemini store does not exist.
// "blob" checks that the Blob store credentials can sign an upload URL.
export async function GET() {
  const model = modelName();
  let geminiError: string | undefined;
  let store = false;
  try {
    const storeName = await findStoreName();
    if (storeName) await gemini().fileSearchStores.get({ name: storeName });
    store = Boolean(storeName);
  } catch (error) {
    logError("health-gemini", error);
    geminiError = describeError(error);
  }

  let blobError: string | undefined;
  try {
    await issueSignedToken({ pathname: "uploads/health-check.txt", operations: ["put"] });
  } catch (error) {
    logError("health-blob", error);
    blobError = describeError(error);
  }

  const ok = !geminiError && !blobError;
  return Response.json(
    { ok, store, model, blob: !blobError, geminiError, blobError },
    { status: ok ? 200 : 500 },
  );
}
