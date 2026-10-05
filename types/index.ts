// ─── Central types barrel ─────────────────────────────────────────────────────
// Import from here for convenience: import type { Message, FileData } from "@/types"

export type {
  MessageRole,
  Message,
  FileData,
  StatusStep,
  WorkspaceData,
  WorkspaceUser,
  SSEGenAiEvent,
  SSEImproveEvent,
} from "./workspace";
export { isMessage, isFileData } from "./workspace";
export type { ProjectSummary } from "./project";
export type { Plan } from "./plans";
export { isPlan } from "./plans";

