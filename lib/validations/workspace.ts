import { z } from "zod";

// ─── Core Schemas ─────────────────────────────────────────────────────────────

export const messageRoleSchema = z.enum(["user", "assistant"]);

export const messageSchema = z.object({
  role: messageRoleSchema,
  content: z.string(),
  imageUrl: z.string().optional(),
});

export const fileItemSchema = z.object({
  code: z.string(),
});

export const fileDataSchema = z.object({
  files: z.record(z.string(), fileItemSchema),
  dependencies: z.record(z.string(), z.string()).default({}),
  title: z.string().optional(),
});

export const statusStepSchema = z.object({
  label: z.string(),
  status: z.enum(["running", "done"]),
});

// ─── API Request & Response Schemas ──────────────────────────────────────────

export const genAiCodeRequestSchema = z.object({
  workspaceId: z.string().nullable().optional(),
  userId: z.string().min(1, { error: "User ID is required" }),
  messages: z
    .array(messageSchema)
    .min(1, { error: "At least one message is required" }),
  fileData: fileDataSchema.nullable().optional(),
});

export const aiGeneratedCodeSchema = z.object({
  assistantMessage: z.string().default("Application generated successfully."),
  title: z.string().optional(),
  files: z
    .record(z.string(), fileItemSchema)
    .refine((files) => Object.keys(files).length > 0, {
      error: "AI response must contain at least one valid file",
    }),
  dependencies: z.record(z.string(), z.string()).default({}),
});

export const improveRequestSchema = z.object({
  userId: z.string().min(1, { error: "User ID is required" }),
  workspaceId: z.string().min(1, { error: "Workspace ID is required" }),
  userRequest: z
    .string()
    .min(1, { error: "Improvement prompt cannot be empty" }),
  fileData: fileDataSchema,
});

export const importWorkspaceSchema = z.object({
  id: z.string().optional(),
  title: z.string().nullable().optional(),
  messages: z.array(messageSchema).default([]),
  fileData: fileDataSchema.nullable().optional(),
});

// ─── Inferred Types ──────────────────────────────────────────────────────────

export type MessageRole = z.infer<typeof messageRoleSchema>;
export type Message = z.infer<typeof messageSchema>;
export type FileItem = z.infer<typeof fileItemSchema>;
export type FileData = z.infer<typeof fileDataSchema>;
export type StatusStep = z.infer<typeof statusStepSchema>;
export type GenAiCodeRequest = z.infer<typeof genAiCodeRequestSchema>;
export type AiGeneratedCode = z.infer<typeof aiGeneratedCodeSchema>;
export type ImproveRequest = z.infer<typeof improveRequestSchema>;
export type ImportWorkspaceData = z.infer<typeof importWorkspaceSchema>;

// ─── High-Performance Zod 4 Type Guards ──────────────────────────────────────
// schema.validate(value) evaluates schema checks without allocating error trees

export function isMessage(value: unknown): value is Message {
  return messageSchema.validate(value);
}

export function isFileData(value: unknown): value is FileData {
  return fileDataSchema.validate(value);
}
