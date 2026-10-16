import { describeError, logError, step } from "@/lib/errors";
import { isUuid } from "@/lib/files";
import { writeAnswer } from "@/lib/llm";
import { NOT_FOUND_REPLY, readAnswer, type NumberedPassage } from "@/lib/sources";
import type { ChatResponse, ChatTurn } from "@/lib/types";
import { listFiles, searchPassages } from "@/lib/vector";

export const runtime = "nodejs";
export const maxDuration = 120;

const TOP_K = 8;
const MAX_HISTORY_TURNS = 3;
const MAX_TURN_CHARS = 2000;
const MAX_QUESTION_CHARS = 2000;

// "detail" carries the reason so problems can be diagnosed from the UI.
const answerError = (detail: string) =>
  Response.json({ error: "answer_failed", detail }, { status: 502 });

type ChatBody = { question?: unknown; scope?: unknown; history?: unknown };

function readHistory(value: unknown): ChatTurn[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (t): t is ChatTurn =>
        Boolean(t) && typeof t.question === "string" && typeof t.answer === "string",
    )
    .slice(-MAX_HISTORY_TURNS)
    .map((t) => ({
      question: t.question.slice(0, MAX_TURN_CHARS),
      answer: t.answer.slice(0, MAX_TURN_CHARS),
    }));
}

export async function POST(request: Request) {
  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const question =
    typeof body.question === "string" ? body.question.trim().slice(0, MAX_QUESTION_CHARS) : "";
  if (!question) return Response.json({ error: "empty_question" }, { status: 400 });
  // The scope goes into a filter expression, so only a UUID is accepted.
  const scope = body.scope === "all" ? "all" : isUuid(body.scope) ? body.scope : null;
  if (!scope) return Response.json({ error: "bad_scope" }, { status: 400 });
  const history = readHistory(body.history);

  try {
    const files = await step("List files", listFiles);
    const inScope = scope === "all" ? files : files.filter((f) => f.appFileId === scope);
    if (inScope.length === 0) {
      return Response.json({ error: "no_ready_files" }, { status: 409 });
    }

    // A follow-up like "what about the second point?" says little on its own,
    // so search with the previous question as well.
    const lastQuestion = history.at(-1)?.question;
    const searchText = lastQuestion ? `${lastQuestion}\n${question}` : question;
    const found = await step("Search passages", () =>
      searchPassages(searchText, TOP_K, scope === "all" ? undefined : scope),
    );
    if (found.length === 0) {
      const response: ChatResponse = { answer: NOT_FOUND_REPLY, sources: [] };
      return Response.json(response);
    }

    const passages: NumberedPassage[] = found.map((p, i) => ({ number: i + 1, ...p }));
    const reply = await step("Write answer (Groq)", () => writeAnswer(question, history, passages));
    const { answer, sources } = readAnswer(reply, passages);
    if (!answer) return answerError("The model returned an empty answer");

    const response: ChatResponse = { answer, sources };
    return Response.json(response);
  } catch (error) {
    logError("chat", error);
    return answerError(describeError(error));
  }
}
