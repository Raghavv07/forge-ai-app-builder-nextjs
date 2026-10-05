import { getCurrentAuthUser } from "@/lib/auth-helper";
import { NextRequest } from "next/server";
import { z } from "zod";
import { db, type Prisma } from "@/lib/prisma";
import { aj } from "@/lib/arcjet";
import {
  type Message,
  type FileData,
  type SSEGenAiEvent,
  genAiCodeRequestSchema,
  aiGeneratedCodeSchema,
} from "@/types/workspace";
import {
  getGenAI,
  DEFAULT_GEMINI_MODEL,
  AI_APP_RESPONSE_SCHEMA,
  buildGeminiContents,
} from "@/lib/gemini";

// ─── SSE helper ───────────────────────────────────────────────────────────────

function sseEvent(
  type: SSEGenAiEvent["type"],
  payload: Record<string, unknown>
): string {
  return `data: ${JSON.stringify({ type, ...payload })}\n\n`;
}

// ─── Extract short label from a Gemini thought chunk ─────────────────────────
// Gemini thoughts often start with a bold heading like **Verify Config**
// We extract that. If no bold heading, take the first sentence only.

function extractThoughtLabel(text: string): string | null {
  // Try to grab **bold heading** at the start
  const boldMatch = text.match(/\*\*([^*]{4,60})\*\*/);
  const matched = boldMatch?.[1];
  if (matched) return matched.trim();

  // Fall back to first sentence (up to first . or \n), capped at 60 chars
  const sentence = text.split(/[.\n]/)[0]?.trim() ?? "";
  if (sentence.length >= 8 && sentence.length <= 80) return sentence;

  return null;
}

// ─── npm validation ───────────────────────────────────────────────────────────

async function validateDependencies(
  deps: Record<string, string>
): Promise<Record<string, string>> {
  const valid: Record<string, string> = {};
  await Promise.all(
    Object.entries(deps).map(async ([pkg, version]) => {
      try {
        const res = await fetch(`https://registry.npmjs.org/${pkg}/latest`, {
          signal: AbortSignal.timeout(1500),
        });
        if (res.ok) valid[pkg] = version;
      } catch {
        // silently skip hallucinated packages
      }
    })
  );
  return valid;
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert React developer. Your job is to generate complete, working React applications based on user prompts.

RULES:
1. Always respond with a valid JSON object — no markdown fences, no extra text.
2. The JSON must match this exact shape:
{
  "assistantMessage": "<brief explanation of what you built/changed>",
  "title": "<short 2-4 word title for the app, e.g. 'Todo List App'>",
  "files": [
    { "path": "/App.js", "code": "<full file content>" },
    { "path": "/components/SomeComponent.js", "code": "<full file content>" }
  ],
  "dependencies": [
    { "name": "lucide-react", "version": "latest" }
  ]
}
3. Use React (functional components + hooks). Do NOT use TypeScript in generated files.
4. Use Tailwind CSS for all styling. Do not use CSS modules or inline styles unless absolutely necessary.
5. The entry point must always be /App.js and must export a default component.
6. All imports must reference files you include in "files" or packages in "dependencies".
7. Do not include react, react-dom, or tailwindcss in "dependencies" — they are always available.
8. When modifying existing code, include ALL files (both changed and unchanged) in "files".
9. Keep code clean, readable, and production-quality.
10. If the user attaches an image, use it as a design reference and match the layout/style as closely as possible.`;

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const authUser = await getCurrentAuthUser();
  if (!authUser) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { message: "Invalid JSON in request body" },
      { status: 400 }
    );
  }

  const parsedBody = genAiCodeRequestSchema.safeParse(body);
  if (!parsedBody.success) {
    console.error(
      "[api/gen-ai-code] Zod Validation Error:",
      parsedBody.error.issues
    );
    return Response.json(
      {
        message: "Invalid request payload",
        error: z.prettifyError(parsedBody.error),
      },
      { status: 400 }
    );
  }

  const { workspaceId, userId, messages, fileData } = parsedBody.data;

  // ── Arcjet: rate limit, prompt injection, abuse protection ──────────────────
  if (aj) {
    const lastUserMessage =
      [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

    try {
      const decision = await aj.protect(request, {
        requested: 1,
        userId: authUser.clerkId,
        detectPromptInjectionMessage: lastUserMessage,
      });

      if (decision.isDenied()) {
        if (decision.reason.isRateLimit()) {
          return Response.json(
            { message: "Too many generation requests. Please wait a minute." },
            { status: 429 }
          );
        }
        if (decision.reason.isPromptInjection()) {
          console.warn("[Arcjet] Prompt injection flagged:", lastUserMessage);
          return Response.json(
            { message: "Prompt injection detected. Request rejected for security." },
            { status: 400 }
          );
        }
        return Response.json(
          { message: "Request blocked by security policy." },
          { status: 403 }
        );
      }
    } catch (arcjetError) {
      console.warn("[Arcjet Protect Non-fatal Error]:", arcjetError);
    }
  }

  const user = await db.user.findFirst({
    where: { id: userId, clerkId: authUser.clerkId },
    select: { id: true },
  });

  if (!user)
    return Response.json({ message: "User not found" }, { status: 404 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (chunk: string) =>
        controller.enqueue(encoder.encode(chunk));

      try {
        const ai = getGenAI();
        const contents = buildGeminiContents(messages, fileData ?? null);

        const geminiStream = await ai.models.generateContentStream({
          model: DEFAULT_GEMINI_MODEL,
          contents,
          config: {
            abortSignal: request.signal,
            systemInstruction: SYSTEM_PROMPT,
            temperature: 0.7,
            responseMimeType: "application/json",
            responseSchema: AI_APP_RESPONSE_SCHEMA,
            thinkingConfig: {
              includeThoughts: true,
            },
          },
        });

        let accumulated = ""; // final JSON output
        let lastEmitTime = 0; // throttle thought emissions

        for await (const chunk of geminiStream) {
          const parts = chunk.candidates?.[0]?.content?.parts ?? [];

          for (const part of parts) {
            if (!part.text) continue;

            if (part.thought) {
              // Extract just the short label — not the full wall of text
              const now = Date.now();
              if (now - lastEmitTime > 600) {
                const label = extractThoughtLabel(part.text);
                if (label) {
                  enqueue(sseEvent("status", { message: label }));
                  lastEmitTime = now;
                }
              }
            } else {
              // Actual JSON output
              accumulated += part.text;
            }
          }
        }

        // ── Parse and validate the complete JSON response with Zod 4 ─────────

        let cleanJson = accumulated.trim();
        const jsonBlockMatch = cleanJson.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonBlockMatch && jsonBlockMatch[1]) {
          cleanJson = jsonBlockMatch[1].trim();
        } else {
          cleanJson = cleanJson
            .replace(/^```json\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/\s*```$/i, "")
            .trim();
        }

        const firstBrace = cleanJson.indexOf("{");
        const lastBrace = cleanJson.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
        }

        let rawParsed: unknown;
        try {
          rawParsed = JSON.parse(cleanJson);
        } catch {
          console.error("[gen-ai-code] Failed to parse JSON:", cleanJson);
          enqueue(
            sseEvent("error", {
              message: "AI returned invalid JSON. Please try again.",
            })
          );
          controller.close();
          return;
        }

        const aiValidation = aiGeneratedCodeSchema.safeParse(rawParsed);
        if (!aiValidation.success) {
          console.error(
            "[gen-ai-code] AI validation failed:",
            aiValidation.error.issues,
            "rawParsed:",
            JSON.stringify(rawParsed, null, 2)
          );
          enqueue(
            sseEvent("error", {
              message: `AI generated an invalid app structure: ${z.prettifyError(
                aiValidation.error
              )}`,
            })
          );
          controller.close();
          return;
        }

        const {
          assistantMessage,
          title: aiTitle,
          files,
          dependencies,
        } = aiValidation.data;

        // ── Validate npm packages ──────────────────────────────────────────────

        enqueue(sseEvent("status", { message: "Validating packages…" }));
        const validatedDeps = await validateDependencies(dependencies ?? {});
        const newFileData: FileData = {
          files,
          dependencies: validatedDeps,
          title: aiTitle,
        };

        // ── Upsert workspace ──────────────────────────────────────────────────

        enqueue(sseEvent("status", { message: "Saving…" }));

        const lastUserMessage = messages[messages.length - 1];
        const fallbackTitle = lastUserMessage?.content
          ? lastUserMessage.content.slice(0, 80)
          : "New App";
        const updatedMessages: Message[] = [
          ...messages,
          { role: "assistant", content: assistantMessage },
        ];

        let workspace;
        try {
          workspace = workspaceId
            ? await db.workspace.update({
                where: { id: workspaceId, userId },
                data: {
                  title: aiTitle ?? undefined,
                  messages: updatedMessages as unknown as Prisma.InputJsonValue,
                  fileData: newFileData as unknown as Prisma.InputJsonValue,
                },
              })
            : await db.workspace.create({
                data: {
                  userId,
                  title: aiTitle ?? fallbackTitle,
                  messages: updatedMessages as unknown as Prisma.InputJsonValue,
                  fileData: newFileData as unknown as Prisma.InputJsonValue,
                },
              });
        } catch (dbErr: unknown) {
          if (
            workspaceId &&
            typeof dbErr === "object" &&
            dbErr !== null &&
            "code" in dbErr &&
            dbErr.code === "P2025"
          ) {
            // Workspace not found in DB — fallback to creating a new workspace
            try {
              workspace = await db.workspace.create({
                data: {
                  userId,
                  title: aiTitle ?? fallbackTitle,
                  messages: updatedMessages as unknown as Prisma.InputJsonValue,
                  fileData: newFileData as unknown as Prisma.InputJsonValue,
                },
              });
            } catch (createErr) {
              console.error("[gen-ai-code] Fallback workspace create error:", createErr);
              enqueue(
                sseEvent("error", {
                  message: "Failed to save workspace. Please try again.",
                })
              );
              controller.close();
              return;
            }
          } else {
            console.error("[gen-ai-code] DB error:", dbErr);
            enqueue(
              sseEvent("error", {
                message: "Failed to save workspace. Please try again.",
              })
            );
            controller.close();
            return;
          }
        }

        // ── Emit final result ──────────────────────────────────────────────────

        enqueue(
          sseEvent("done", {
            workspaceId: workspace.id,
            assistantMessage,
            fileData: newFileData,
          })
        );
      } catch (err) {
        if (
          request.signal.aborted ||
          (err instanceof Error && err.name === "AbortError")
        ) {
          return;
        }

        console.error("[gen-ai-code] stream error:", err);

        let errorMessage = "Something went wrong. Please try again.";
        if (err instanceof Error) {
          if (
            err.message.includes("429") ||
            err.message.toLowerCase().includes("quota") ||
            err.message.toLowerCase().includes("resource has been exhausted")
          ) {
            errorMessage =
              "AI rate limit or quota exceeded. Please wait a moment and try again.";
          } else if (
            err.message.includes("503") ||
            err.message.toLowerCase().includes("overloaded")
          ) {
            errorMessage =
              "AI service is temporarily busy. Please try again in a few seconds.";
          } else if (err.message.toLowerCase().includes("safety")) {
            errorMessage =
              "Prompt or response was flagged by safety filters. Please rephrase.";
          } else {
            errorMessage = err.message;
          }
        }

        try {
          enqueue(
            sseEvent("error", {
              message: errorMessage,
            })
          );
        } catch {
          // stream already closed
        }
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export const runtime = "nodejs";
export const maxDuration = 300; // for vercel - 300s on Fluid
