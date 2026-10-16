"use client";

import { uploadPresigned } from "@vercel/blob/client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  BLOB_ACCESS,
  MIME_BY_EXTENSION,
  PROCESSING_FAILED_MESSAGE,
  checkFile,
  getExtension,
  problemMessage,
} from "@/lib/files";
import type { ChatResponse, ChatTurn, FileItem, Source } from "@/lib/types";

// State lives in the root layout, so it survives switching between
// Documents and Chat. It is lost on a page reload by design.

export type RowStage = "uploading" | "processing" | "ready" | "error";

export type FileRow = {
  key: string;
  name: string;
  sizeBytes: number;
  stage: RowStage;
  error?: string;
  detail?: string; // technical reason, shown under the error for diagnosis
  file?: FileItem; // set for files that are indexed and searchable
};

type LocalRow = Omit<FileRow, "file">;

export type Message =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "thinking" }
  | {
      id: number;
      role: "bot";
      text: string;
      sources: Source[];
      isNotice: boolean;
      detail?: string; // technical reason for an error, shown for diagnosis
    };

export const NO_READY_FILES_REPLY =
  "There are no ready files to search yet. Upload one on the Documents page first.";
export const CHAT_ERROR_REPLY = "Something went wrong getting an answer. Please try again.";
const REMOVE_ERROR = "Couldn't remove the file. Please try again.";
const UPLOAD_FAILED_MESSAGE = "Upload failed. Please try again.";
const TOO_MUCH_TEXT_MESSAGE =
  "This file has too much text to index. Split it into smaller files, then try again.";
const TIMEOUT_MESSAGE = "Processing took too long. Please try again.";
const GENERIC_PROCESSING_MESSAGE = "Processing failed. Please try again.";

type AppState = {
  rows: FileRow[];
  readyFiles: FileItem[];
  filesStatus: "loading" | "loaded" | "error";
  uploadFile: (file: File) => Promise<void>;
  removeRow: (row: FileRow) => Promise<void>;
  messages: Message[];
  inFlight: boolean;
  ask: (question: string) => Promise<void>;
  scope: string;
  setScope: (scope: string) => void;
};

const AppStateContext = createContext<AppState | null>(null);

export function useAppState(): AppState {
  const state = useContext(AppStateContext);
  if (!state) throw new Error("useAppState must be used inside AppStateProvider");
  return state;
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [filesStatus, setFilesStatus] = useState<AppState["filesStatus"]>("loading");
  const [localRows, setLocalRows] = useState<LocalRow[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inFlight, setInFlight] = useState(false);
  const [selectedScope, setScopeState] = useState("all");
  // Earlier exchanges in this scope, sent with follow-up questions.
  const history = useRef<ChatTurn[]>([]);
  const nextMessageId = useRef(1);
  // Falls back to all files if the chosen file was removed or replaced.
  const scope =
    selectedScope === "all" || files.some((f) => f.appFileId === selectedScope)
      ? selectedScope
      : "all";

  useEffect(() => {
    fetch("/api/files")
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.json() as Promise<{ files: FileItem[] }>;
      })
      .then((data) => {
        setFiles(data.files);
        setFilesStatus("loaded");
      })
      .catch(() => setFilesStatus("error"));
  }, []);

  // A new scope starts a new conversation, so answers from other files do not leak in.
  const setScope = useCallback((next: string) => {
    setScopeState(next);
    history.current = [];
  }, []);

  const patchLocalRow = (key: string, patch: Partial<LocalRow>) =>
    setLocalRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const uploadFile = useCallback(
    async (file: File) => {
      const key = crypto.randomUUID();
      const problem = checkFile(file.name, file.size);
      if (problem) {
        setLocalRows((rows) => [
          { key, name: file.name, sizeBytes: file.size, stage: "error", error: problemMessage(problem) },
          ...rows,
        ]);
        return;
      }

      const existing = files.find((f) => f.name === file.name);
      if (existing && !window.confirm("Replace the existing file?")) return;

      const extension = getExtension(file.name)!;
      setLocalRows((rows) => [
        { key, name: file.name, sizeBytes: file.size, stage: "uploading" },
        ...rows,
      ]);

      let blob;
      try {
        blob = await uploadPresigned(`uploads/${key}.${extension}`, file, {
          access: BLOB_ACCESS,
          handleUploadUrl: "/api/blob/upload",
          contentType: MIME_BY_EXTENSION[extension],
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        patchLocalRow(key, {
          stage: "error",
          error: UPLOAD_FAILED_MESSAGE,
          detail: `Upload to storage failed: ${reason}`,
        });
        return;
      }
      patchLocalRow(key, { stage: "processing" });

      try {
        const res = await fetch("/api/files/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            blobUrl: blob.url,
            fileName: file.name,
            sizeBytes: file.size,
            appFileId: key,
            replaceAppFileId: existing?.appFileId,
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
            reason?: string;
            detail?: string;
          };
          patchLocalRow(key, {
            stage: "error",
            error:
              body.reason === "no_text"
                ? PROCESSING_FAILED_MESSAGE
                : body.reason === "too_much_text"
                  ? TOO_MUCH_TEXT_MESSAGE
                  : body.error === "timeout"
                    ? TIMEOUT_MESSAGE
                    : GENERIC_PROCESSING_MESSAGE,
            detail: `Processing step failed: ${body.error ?? `status ${res.status}`}${body.detail ? `: ${body.detail}` : ""}`,
          });
          return;
        }
        const { file: stored } = (await res.json()) as { file: FileItem };

        setFiles((prev) => [
          stored,
          ...prev.filter(
            (f) => f.appFileId !== existing?.appFileId && f.appFileId !== stored.appFileId,
          ),
        ]);
        setLocalRows((rows) => rows.filter((r) => r.key !== key));
        if (existing && scope === existing.appFileId) setScope("all");
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        patchLocalRow(key, {
          stage: "error",
          error: GENERIC_PROCESSING_MESSAGE,
          detail: `Processing step failed: ${reason}`,
        });
      }
    },
    [files, scope, setScope],
  );

  const removeRow = useCallback(
    async (row: FileRow) => {
      if (!window.confirm(`Remove ${row.name}? It will no longer be searched.`)) return;
      if (!row.file) {
        setLocalRows((rows) => rows.filter((r) => r.key !== row.key));
        return;
      }
      const { appFileId } = row.file;
      const res = await fetch(`/api/files/${encodeURIComponent(appFileId)}`, {
        method: "DELETE",
      }).catch(() => null);
      if (!res || (!res.ok && res.status !== 404)) {
        window.alert(REMOVE_ERROR);
        return;
      }
      setFiles((prev) => prev.filter((f) => f.appFileId !== appFileId));
      if (scope === appFileId) setScope("all");
    },
    [scope, setScope],
  );

  const ask = useCallback(
    async (rawQuestion: string) => {
      const question = rawQuestion.trim();
      if (!question || inFlight) return;
      const userId = nextMessageId.current++;
      const botId = nextMessageId.current++;
      const userMessage: Message = { id: userId, role: "user", text: question };

      if (files.length === 0) {
        setMessages((prev) => [
          ...prev,
          userMessage,
          { id: botId, role: "bot", text: NO_READY_FILES_REPLY, sources: [], isNotice: true },
        ]);
        return;
      }

      setMessages((prev) => [...prev, userMessage, { id: botId, role: "thinking" }]);
      setInFlight(true);
      let reply: Message;
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            scope,
            history: history.current,
          }),
        });
        if (res.status === 409) {
          reply = { id: botId, role: "bot", text: NO_READY_FILES_REPLY, sources: [], isNotice: true };
        } else if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
          throw new Error(`${body.error ?? `status ${res.status}`}${body.detail ? `: ${body.detail}` : ""}`);
        } else {
          const data = (await res.json()) as ChatResponse;
          history.current = [...history.current, { question, answer: data.answer }].slice(-3);
          reply = { id: botId, role: "bot", text: data.answer, sources: data.sources, isNotice: false };
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        reply = { id: botId, role: "bot", text: CHAT_ERROR_REPLY, sources: [], isNotice: true, detail };
      }
      setMessages((prev) => prev.map((m) => (m.id === botId ? reply : m)));
      setInFlight(false);
    },
    [files.length, inFlight, scope],
  );

  const rows = useMemo<FileRow[]>(
    () => [
      ...localRows,
      ...files.map((f) => ({
        key: f.appFileId,
        name: f.name,
        sizeBytes: f.sizeBytes,
        stage: "ready" as const,
        file: f,
      })),
    ],
    [localRows, files],
  );

  const value: AppState = {
    rows,
    readyFiles: files,
    filesStatus,
    uploadFile,
    removeRow,
    messages,
    inFlight,
    ask,
    scope,
    setScope,
  };

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}
