import { z } from "zod";

// ─── Core Schemas ─────────────────────────────────────────────────────────────

export const messageRoleSchema = z.enum(["user", "assistant"]);

export const messageSchema = z
  .object({
    role: messageRoleSchema,
    content: z.string(),
    imageUrl: z.string().nullable().optional(),
  })
  .passthrough();

export const fileItemSchema = z
  .object({
    code: z.string().default(""),
  })
  .passthrough();

export const fileDataSchema = z
  .object({
    files: z.record(z.string(), fileItemSchema).default({}),
    dependencies: z.record(z.string(), z.string()).default({}),
    title: z.string().nullable().optional(),
  })
  .passthrough();

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
    .union([
      z
        .array(
          z.object({
            path: z.string(),
            code: z.string(),
          })
        )
        .transform((arr) => {
          const record: Record<string, { code: string }> = {};
          for (const item of arr) {
            const p = item.path.startsWith("/") ? item.path : `/${item.path}`;
            record[p] = { code: item.code };
          }
          return record;
        }),
      z.record(
        z.string(),
        z.union([
          fileItemSchema,
          z.string().transform((code) => ({ code })),
        ])
      ),
    ])
    .refine((files) => Object.keys(files).length > 0, {
      error: "AI response must contain at least one valid file",
    }),
  dependencies: z
    .union([
      z
        .array(
          z.object({
            name: z.string(),
            version: z.string().default("latest"),
          })
        )
        .transform((arr) => {
          const record: Record<string, string> = {};
          for (const item of arr) {
            record[item.name] = item.version;
          }
          return record;
        }),
      z.record(z.string(), z.string()),
    ])
    .default({}),
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
