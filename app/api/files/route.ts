import { findStoreName, listFiles, logError } from "@/lib/gemini";

export const runtime = "nodejs";

export async function GET() {
  try {
    const storeName = await findStoreName();
    const files = storeName ? await listFiles(storeName) : [];
    return Response.json({ files });
  } catch (error) {
    logError("files-list", error);
    return Response.json({ error: "list_failed" }, { status: 500 });
  }
}
