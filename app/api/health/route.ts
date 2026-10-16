import { findStoreName, gemini, logError, modelName } from "@/lib/gemini";

export const runtime = "nodejs";

// Checks the env vars right after a deploy. "store: false" with ok: true
// means no file has been uploaded yet, so the store does not exist.
export async function GET() {
  const model = modelName();
  try {
    const storeName = await findStoreName();
    if (storeName) await gemini().fileSearchStores.get({ name: storeName });
    return Response.json({ ok: true, store: Boolean(storeName), model });
  } catch (error) {
    logError("health", error);
    return Response.json({ ok: false, store: false, model }, { status: 500 });
  }
}
