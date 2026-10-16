import { issueSignedToken } from "@vercel/blob";
import { describeError, logError } from "@/lib/errors";
import { checkModel, modelName } from "@/lib/llm";
import { indexInfo } from "@/lib/vector";

export const runtime = "nodejs";

// Checks each service right after a deploy: Groq (key and model), the
// Upstash Vector index (and its embedding models), and Blob credentials.
export async function GET() {
  const model = modelName();
  const errors: Record<string, string> = {};

  try {
    await checkModel();
  } catch (error) {
    logError("health-groq", error);
    errors.groq = describeError(error);
  }

  let search: { hybrid: boolean; denseModel?: string; sparseModel?: string } | undefined;
  try {
    const info = await indexInfo();
    const denseModel = info.denseIndex?.embeddingModel;
    const sparseModel = info.sparseIndex?.embeddingModel;
    search = { hybrid: Boolean(denseModel && sparseModel), denseModel, sparseModel };
    if (!denseModel && !sparseModel) {
      errors.vector =
        "The Upstash index has no built-in embedding model. Create it with an Upstash embedding model.";
    }
  } catch (error) {
    logError("health-vector", error);
    errors.vector = describeError(error);
  }

  try {
    await issueSignedToken({ pathname: "uploads/health-check.txt", operations: ["put"] });
  } catch (error) {
    logError("health-blob", error);
    errors.blob = describeError(error);
  }

  const ok = Object.keys(errors).length === 0;
  return Response.json({ ok, model, search, errors }, { status: ok ? 200 : 500 });
}
