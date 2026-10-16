import type { FileExtension } from "./files";

export type FileItem = {
  documentName: string; // Gemini document resource name, used for delete
  appFileId: string; // our UUID, used for the "Search in" filter
  name: string; // original file name
  extension: FileExtension;
  sizeBytes: number;
  uploadedAt: number; // Unix seconds
  status: "ready"; // files listed from Gemini are treated as ready
};

export type Source = {
  file: string;
  page: number | null; // null when Gemini returns no page number
  snippet: string;
};

export type ChatResponse = {
  answer: string;
  sources: Source[];
  interactionId: string;
};
