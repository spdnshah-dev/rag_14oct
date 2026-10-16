import { logError } from "@/lib/errors";
import { listFiles } from "@/lib/vector";

export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json({ files: await listFiles() });
  } catch (error) {
    logError("files-list", error);
    return Response.json({ error: "list_failed" }, { status: 500 });
  }
}
