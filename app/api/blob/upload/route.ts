import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { ALLOWED_MIME_TYPES, MAX_FILE_BYTES, getExtension } from "@/lib/files";
import { logError } from "@/lib/gemini";

export const runtime = "nodejs";

// Issues a short-lived token so the browser can upload straight to Vercel Blob.
export async function POST(request: Request) {
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!getExtension(pathname)) throw new Error("unsupported_type");
        return {
          allowedContentTypes: ALLOWED_MIME_TYPES,
          maximumSizeInBytes: MAX_FILE_BYTES,
          addRandomSuffix: true,
        };
      },
    });
    return Response.json(result);
  } catch (error) {
    logError("blob-upload", error);
    return Response.json({ error: "upload_rejected" }, { status: 400 });
  }
}
