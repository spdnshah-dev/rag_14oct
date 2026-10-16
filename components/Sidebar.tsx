"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NAME } from "@/lib/app";
import { useAppState } from "./AppState";
import { ChatIcon, FileIcon } from "./icons";

const navItem =
  "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 font-medium no-underline";

export function Sidebar() {
  const pathname = usePathname();
  const { rows, readyFiles } = useAppState();
  const onDocs = pathname.startsWith("/documents");
  const onChat = pathname.startsWith("/chat");

  return (
    <nav
      aria-label="Main"
      className="flex flex-[1_1_220px] flex-col gap-7 bg-ink px-5 py-7 text-page"
    >
      <div className="flex flex-col gap-0.5 px-2">
        <div className="text-lg font-semibold tracking-[-0.01em]">{APP_NAME}</div>
        <div className="text-[13px] text-nav-sub">Ask questions about your files</div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Link
          href="/documents"
          aria-current={onDocs ? "page" : undefined}
          className={`${navItem} ${onDocs ? "bg-nav-active text-white" : "text-nav-ink hover:bg-nav-active/60"}`}
        >
          <FileIcon size={18} />
          <span>Documents</span>
          <span className="ml-auto font-mono text-xs">{rows.length}</span>
        </Link>
        <Link
          href="/chat"
          aria-current={onChat ? "page" : undefined}
          className={`${navItem} ${onChat ? "bg-nav-active text-white" : "text-nav-ink hover:bg-nav-active/60"}`}
        >
          <ChatIcon size={18} />
          <span>Chat</span>
        </Link>
      </div>
      <div className="mt-auto px-2 text-xs text-nav-sub">
        {readyFiles.length} of {rows.length} files ready to search
      </div>
    </nav>
  );
}
