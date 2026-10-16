"use client";

import { useEffect, useRef, useState } from "react";
import type { Source } from "@/lib/types";
import { useAppState, type Message } from "./AppState";
import { SendIcon } from "./icons";

function SourceCard({ source }: { source: Source }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-line bg-surface px-3 py-2.5">
      <span className="text-[13px] font-medium break-words">
        {source.file}{" "}
        <span className="font-mono font-normal text-muted">
          · {source.page === null ? "no page number" : `page ${source.page}`}
        </span>
      </span>
      {source.snippet && <span className="text-[13px] text-muted">{source.snippet}</span>}
    </div>
  );
}

function ChatMessage({ message }: { message: Message }) {
  if (message.role === "user") {
    return (
      <div className="max-w-[75%] self-end rounded-[12px_12px_2px_12px] bg-accent px-3.5 py-2.5 break-words whitespace-pre-line text-white">
        {message.text}
      </div>
    );
  }
  if (message.role === "thinking") {
    return (
      <div className="self-start rounded-xl bg-pending px-3.5 py-2.5 text-muted italic">
        Searching your documents…
      </div>
    );
  }
  return (
    <div className="flex max-w-[85%] flex-col gap-2.5 self-start">
      <div className="rounded-[12px_12px_12px_2px] bg-pending px-4 py-3 break-words whitespace-pre-line">
        {message.text}
      </div>
      {message.detail && (
        <span className="font-mono text-[11px] break-all text-error-ink">{message.detail}</span>
      )}
      {message.sources.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold tracking-[0.06em] text-muted uppercase">
            Sources used
          </span>
          {message.sources.map((source, i) => (
            <SourceCard key={i} source={source} />
          ))}
        </div>
      ) : (
        !message.isNotice && (
          <span className="text-xs text-error-ink">No matching passage found in your files.</span>
        )
      )}
    </div>
  );
}

export function ChatView() {
  const { messages, inFlight, ask, scope, setScope, readyFiles } = useAppState();
  const [draft, setDraft] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages]);

  const send = () => {
    if (inFlight || !draft.trim()) return;
    void ask(draft);
    setDraft("");
  };

  return (
    <div className="flex w-full max-w-[860px] grow flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-[30px] font-semibold tracking-[-0.02em]">Ask your documents</h1>
          <p className="m-0 text-muted">
            Answers come only from your uploaded files, with the passages they used.
          </p>
        </div>
        <div className="flex max-w-full flex-col gap-1">
          <label htmlFor="scope" className="text-xs font-medium text-muted">
            Search in
          </label>
          <select
            id="scope"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="min-h-11 max-w-full rounded-lg border border-line-strong bg-surface px-3 text-ink"
          >
            <option value="all">All ready files ({readyFiles.length})</option>
            {readyFiles.map((f) => (
              <option key={f.appFileId} value={f.appFileId}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        className="flex h-[60dvh] min-h-[320px] flex-col gap-[18px] overflow-y-auto rounded-xl border border-line bg-surface p-4 sm:p-6"
      >
        {messages.map((m) => (
          <ChatMessage key={m.id} message={m} />
        ))}
      </div>

      <div className="flex flex-wrap gap-2.5">
        <label htmlFor="ask" className="sr-only">
          Your question
        </label>
        <input
          id="ask"
          type="text"
          placeholder="Ask a question about your files…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          className="min-h-12 min-w-0 flex-[1_1_240px] rounded-[10px] border border-line-strong bg-surface px-4 text-ink"
        />
        <button
          type="button"
          onClick={send}
          disabled={inFlight}
          className="flex min-h-12 cursor-pointer items-center gap-2 rounded-[10px] bg-accent px-[22px] font-semibold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          <SendIcon size={18} />
          Ask
        </button>
      </div>
    </div>
  );
}
