import type { Metadata } from "next";
import { ChatView } from "@/components/ChatView";

export const metadata: Metadata = { title: "Chat" };

export default function ChatPage() {
  return <ChatView />;
}
