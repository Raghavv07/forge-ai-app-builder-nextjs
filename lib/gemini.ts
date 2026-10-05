import { GoogleGenAI, Type, type Schema, type Part } from "@google/genai";
import type { Message, FileData } from "@/types/workspace";

// ─── Client Singleton ─────────────────────────────────────────────────────────

let aiInstance: GoogleGenAI | null = null;

export function getGenAI(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY is not configured in environment variables."
      );
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

// ─── Default Model & Settings ─────────────────────────────────────────────────

export const DEFAULT_GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.5-flash";

// ─── Strict Structured Output Schema ──────────────────────────────────────────

export const AI_APP_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    assistantMessage: {
      type: Type.STRING,
      description: "Brief explanation of what you built or modified",
    },
    title: {
      type: Type.STRING,
      description: "Short 2-4 word title for the app, e.g. 'Todo List App'",
    },
    files: {
      type: Type.OBJECT,
      description:
        "Mapping of relative file path (e.g. '/App.js', '/components/Header.js') to file object containing 'code' string with complete runnable code",
    },
    dependencies: {
      type: Type.OBJECT,
      description:
        "npm packages needed by the app mapping package name to version, e.g. 'lucide-react': 'latest'",
    },
  },
  required: ["assistantMessage", "title", "files"],
};

// ─── History Trimming & Multimodal Content Builder ────────────────────────────

function trimHistory(messages: Message[]): Message[] {
  if (messages.length <= 10) return messages;
  const first = messages[0];
  if (!first) return messages;
  return [first, ...messages.slice(-8)];
}

export function buildGeminiContents(
  messages: Message[],
  fileData: FileData | null
) {
  const trimmed = trimHistory(messages);

  return trimmed.map((msg, idx) => {
    const role = msg.role === "assistant" ? "model" : "user";

    if (msg.role === "user") {
      const parts: Part[] = [];
      let text = msg.content;

      // Multimodal support: Handle base64 data URLs as inlineData parts
      if (msg.imageUrl) {
        if (msg.imageUrl.startsWith("data:")) {
          const match = msg.imageUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (match && match[1] && match[2]) {
            parts.push({
              inlineData: {
                mimeType: match[1],
                data: match[2],
              },
            });
          }
        } else {
          text = `[The user has attached an image: ${msg.imageUrl}. Use it as a design reference and include it in the generated app where appropriate.]\n\n${text}`;
        }
      }

      const isLast = idx === trimmed.length - 1;
      if (isLast && fileData) {
        text +=
          "\n\nCurrent project files for context:\n" +
          JSON.stringify(fileData, null, 2);
      }

      parts.push({ text });
      return { role, parts };
    }

    return { role, parts: [{ text: msg.content }] };
  });
}
