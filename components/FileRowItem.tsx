"use client";

import { extensionLabel, formatSize } from "@/lib/files";
import type { FileRow, RowStage } from "./AppState";
import { FileIcon, TrashIcon } from "./icons";

const STEPS = [
  { stage: "uploading", label: "Uploading" },
  { stage: "processing", label: "Processing" },
  { stage: "ready", label: "Ready" },
] as const;

const ORDER: Record<RowStage, number> = { uploading: 0, processing: 1, ready: 2, error: -1 };

function StepPills({ stage }: { stage: RowStage }) {
  const current = ORDER[stage];
  return (
    <ol aria-label="Processing steps" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
      {STEPS.map((step, i) => {
        const done = stage === "ready" || i < current;
        const active = i === current && stage !== "ready";
        const tone = done
          ? "bg-done text-accent-dark"
          : active
            ? "bg-accent text-white"
            : "bg-pending text-pending-ink";
        return (
          <li
            key={step.stage}
            aria-current={active ? "step" : undefined}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}
          >
            {active ? `${step.label}…` : step.label}
          </li>
        );
      })}
    </ol>
  );
}

export function FileRowItem({ row, onRemove }: { row: FileRow; onRemove: () => void }) {
  const busy = row.stage === "uploading" || row.stage === "processing";
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-[10px] border border-line bg-surface px-[18px] py-4">
      <FileIcon size={22} strokeWidth={1.6} className="shrink-0 text-muted" />
      <div className="flex min-w-0 flex-[1_1_220px] flex-col">
        <span className="truncate font-medium" title={row.name}>
          {row.name}
        </span>
        <span className="font-mono text-xs text-muted">
          {extensionLabel(row.name)} · {formatSize(row.sizeBytes)}
        </span>
      </div>
      {row.stage === "error" ? (
        <span role="alert" className="flex-[1_1_300px] rounded-lg bg-error px-3 py-1.5 text-[13px] text-error-ink">
          {row.error}
        </span>
      ) : (
        <StepPills stage={row.stage} />
      )}
      <button
        type="button"
        aria-label="Remove file"
        onClick={onRemove}
        disabled={busy}
        title={busy ? "Wait for the upload to finish" : undefined}
        className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-pending disabled:cursor-not-allowed disabled:opacity-40"
      >
        <TrashIcon size={18} />
      </button>
    </div>
  );
}
