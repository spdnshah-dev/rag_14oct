import { errorStatus, findStoreName, gemini, isDocumentOfStore, logError } from "@/lib/gemini";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ documentName: string }> },
) {
  const raw = (await params).documentName;
  const documentName = raw.includes("%") ? decodeURIComponent(raw) : raw;

  try {
    const storeName = await findStoreName();
    if (!storeName || !isDocumentOfStore(documentName, storeName)) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    await gemini().fileSearchStores.documents.delete({
      name: documentName,
      config: { force: true },
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    if (errorStatus(error) === 404) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    logError("files-delete", error);
    return Response.json({ error: "delete_failed" }, { status: 500 });
  }
}
