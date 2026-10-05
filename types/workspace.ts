// ─── Workspace & Chat Types ───────────────────────────────────────────────────

import type { Plan } from "./plans";
import type { FileData } from "@/lib/validations/workspace";

export {
  messageRoleSchema,
  messageSchema,
  fileItemSchema,
  fileDataSchema,
  statusStepSchema,
  genAiCodeRequestSchema,
  aiGeneratedCodeSchema,
  improveRequestSchema,
  importWorkspaceSchema,
  isMessage,
  isFileData,
} from "@/lib/validations/workspace";

export type {
  MessageRole,
  Message,
  FileItem,
  FileData,
  StatusStep,
  GenAiCodeRequest,
  AiGeneratedCode,
  ImproveRequest,
  ImportWorkspaceData,
} from "@/lib/validations/workspace";

export interface WorkspaceData {
  id: string;
  title: string | null;
  messages: unknown;
  fileData: unknown;
}

export interface WorkspaceUser {
  id: string;
  credits: number;
  plan: Plan;
}

// ─── SSE Discriminated Unions ─────────────────────────────────────────────────

export type SSEGenAiEvent =
  | { type: "status"; message: string }
  | {
      type: "done";
      workspaceId: string;
      assistantMessage: string;
      fileData: FileData;
      creditsRemaining?: number;
    }
  | { type: "error"; message: string };

export type SSEImproveEvent =
  | { type: "status"; message: string }
  | { type: "thinking"; text: string }
  | { type: "file_patch"; path: string; code: string; reason: string }
  | {
      type: "done";
      fileData: FileData;
      summary: string;
      creditsRemaining?: number;
    }
  | { type: "error"; message: string };


