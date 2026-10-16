"use client";

import { ACCEPT_ATTRIBUTE } from "@/lib/files";
import { useAppState } from "./AppState";
import { FileRowItem } from "./FileRowItem";
import { UploadIcon } from "./icons";

export function DocumentsView() {
  const { rows, filesStatus, uploadFile, removeRow } = useAppState();

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (file) void uploadFile(file);
  };

  return (
    <div className="flex w-full max-w-[920px] flex-col gap-7">
      <header className="flex flex-col gap-1.5">
        <h1 className="m-0 text-[30px] font-semibold tracking-[-0.02em]">Documents</h1>
        <p className="m-0 max-w-[640px] text-muted">
          Upload the files the assistant should answer from. Each file is read, split into small
          passages, and indexed so the chat can find the right passage for a question.
        </p>
      </header>

      <label
        htmlFor="file-in"
        className="relative flex cursor-pointer flex-col items-center gap-2.5 rounded-xl border-2 border-dashed border-line-strong bg-surface px-6 py-10 text-center focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent"
      >
        <UploadIcon size={36} strokeWidth={1.6} className="text-accent" />
        <span className="text-[17px] font-semibold">Click to choose a file</span>
        <span className="text-[13px] text-muted">
          PDF, plain text, Markdown or Word (.docx) · up to 10 MB per file
        </span>
        <input
          id="file-in"
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          onChange={onPick}
          className="absolute h-px w-px overflow-hidden opacity-0"
        />
      </label>

      <section aria-label="Uploaded files" className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <h2 className="m-0 text-base font-semibold">Your files</h2>
          <span className="text-[13px] text-muted">{rows.length} total</span>
        </div>
        {filesStatus === "loading" && rows.length === 0 && (
          <div className="rounded-[10px] border border-line bg-surface p-6 text-muted">
            Loading your files…
          </div>
        )}
        {filesStatus === "error" && (
          <div role="alert" className="rounded-[10px] bg-error p-4 text-[13px] text-error-ink">
            Couldn&apos;t load your files. Reload the page to try again.
          </div>
        )}
        {filesStatus === "loaded" && rows.length === 0 && (
          <div className="rounded-[10px] border border-line bg-surface p-6 text-muted">
            No files yet. Upload one above to start.
          </div>
        )}
        {rows.map((row) => (
          <FileRowItem key={row.key} row={row} onRemove={() => void removeRow(row)} />
        ))}
      </section>
    </div>
  );
}
