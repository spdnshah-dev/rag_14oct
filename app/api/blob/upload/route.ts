import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { issueSignedToken } from "@vercel/blob";
import { ALLOWED_MIME_TYPES, MAX_FILE_BYTES, getExtension } from "@/lib/files";
import { describeError, logError } from "@/lib/errors";

export const runtime = "nodejs";

const URL_LIFETIME_MS = 10 * 60 * 1000;

// Issues a short-lived presigned URL so the browser can upload straight to
// Vercel Blob. Works with the store's OIDC credentials (BLOB_STORE_ID) or a
// BLOB_READ_WRITE_TOKEN.
export async function POST(request: Request) {
  let body: HandleUploadPresignedBody;
  try {
    body = (await request.json()) as HandleUploadPresignedBody;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const result = await handleUploadPresigned({
      body,
      request,
      // Only used to verify upload-completed callbacks, which this app never requests.
      webhookPublicKey: process.env.BLOB_WEBHOOK_PUBLIC_KEY || "unused",
      getSignedToken: async (pathname) => {
        // The browser picks a random pathname: uploads/<uuid>.<ext>
        if (!pathname.startsWith("uploads/") || !getExtension(pathname)) {
          throw new Error("unsupported_type");
        }
        const validUntil = Date.now() + URL_LIFETIME_MS;
        const token = await issueSignedToken({
          pathname,
          operations: ["put"],
          validUntil,
          allowedContentTypes: ALLOWED_MIME_TYPES,
          maximumSizeInBytes: MAX_FILE_BYTES,
        });
        return {
          token,
          urlOptions: {
            validUntil,
            allowedContentTypes: ALLOWED_MIME_TYPES,
            maximumSizeInBytes: MAX_FILE_BYTES,
          },
        };
      },
    });
    return Response.json(result);
  } catch (error) {
    logError("blob-upload", error);
    return Response.json({ error: "upload_rejected", detail: describeError(error) }, { status: 400 });
  }
}
