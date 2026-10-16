import type { FileExtension } from "./files";

export type FileItem = {
  appFileId: string; // our UUID: the file's id for delete and the "Search in" filter
  name: string; // original file name
  extension: FileExtension;
  sizeBytes: number;
  uploadedAt: number; // Unix seconds
  status: "ready"; // files listed from the index are ready to search
};

export type Source = {
  file: string;
  page: number | null; // null when the file type has no pages
  snippet: string;
};

// One earlier exchange, sent with follow-up questions.
export type ChatTurn = { question: string; answer: string };

export type ChatResponse = {
  answer: string;
  sources: Source[];
};
