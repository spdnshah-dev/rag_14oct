import { logError } from "@/lib/errors";
import { isUuid } from "@/lib/files";
import { deleteFile } from "@/lib/vector";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ appFileId: string }> },
) {
  const { appFileId } = await params;
  if (!isUuid(appFileId)) return Response.json({ error: "not_found" }, { status: 404 });
  try {
    await deleteFile(appFileId);
    return new Response(null, { status: 204 });
  } catch (error) {
    logError("files-delete", error);
    return Response.json({ error: "delete_failed" }, { status: 500 });
  }
}
