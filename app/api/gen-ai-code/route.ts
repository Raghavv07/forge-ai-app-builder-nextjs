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
import {
  generateGroqCodeStream,
  getGroqApiKey,
  DEFAULT_GROQ_MODEL,
} from "@/lib/groq";
import { extractAndParseJson } from "@/lib/json-repair";

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
  const lastUserPrompt =
    [...messages].reverse().find((m) => m.role === "user")?.content ?? "New generation";

  console.log(
    `\n[gen-ai-code] 🚀 Generation requested | User: ${userId} | Prompt: "${lastUserPrompt.slice(0, 60)}..." | Model: ${DEFAULT_GEMINI_MODEL}`
  );

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (chunk: string) =>
        controller.enqueue(encoder.encode(chunk));

      try {
        let accumulated = ""; // final JSON output
        let usedProvider = "gemini";

        try {
          const ai = getGenAI();
          const contents = buildGeminiContents(messages, fileData ?? null);

          let geminiStream;
          let activeModel = DEFAULT_GEMINI_MODEL;
          try {
            geminiStream = await ai.models.generateContentStream({
              model: activeModel,
              contents,
              config: {
                abortSignal: request.signal,
                systemInstruction: SYSTEM_PROMPT,
                temperature: 0.7,
                maxOutputTokens: 8192,
                responseMimeType: "application/json",
                responseSchema: AI_APP_RESPONSE_SCHEMA,
                thinkingConfig: {
                  includeThoughts: true,
                },
              },
            });
          } catch (initialModelErr: unknown) {
            const errMsg = initialModelErr instanceof Error ? initialModelErr.message : String(initialModelErr);
            const isModelOrServiceIssue =
              errMsg.includes("503") ||
              errMsg.includes("404") ||
              errMsg.includes("not found") ||
              errMsg.includes("experiencing high demand") ||
              errMsg.includes("UNAVAILABLE");

            if (isModelOrServiceIssue) {
              const fallbackModels = ["gemini-3.5-flash", "gemini-3-flash-preview", "gemini-2.5-flash"].filter(
                (m) => m !== activeModel
              );

              let succeeded = false;
              for (const fallback of fallbackModels) {
                try {
                  console.warn(
                    `[gen-ai-code] ⚠️ Model "${activeModel}" unavailable. Attempting fallback to "${fallback}"...`
                  );
                  activeModel = fallback;
                  geminiStream = await ai.models.generateContentStream({
                    model: activeModel,
                    contents,
                    config: {
                      abortSignal: request.signal,
                      systemInstruction: SYSTEM_PROMPT,
                      temperature: 0.7,
                      maxOutputTokens: 8192,
                      responseMimeType: "application/json",
                      responseSchema: AI_APP_RESPONSE_SCHEMA,
                      thinkingConfig: {
                        includeThoughts: true,
                      },
                    },
                  });
                  succeeded = true;
                  break;
                } catch {
                  // try next fallback
                }
              }

              if (!succeeded) {
                throw initialModelErr;
              }
            } else {
              throw initialModelErr;
            }
          }

          if (!geminiStream) {
            throw new Error("Failed to initialize Gemini stream");
          }

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
        } catch (geminiError: unknown) {
          const geminiMsg =
            geminiError instanceof Error ? geminiError.message : String(geminiError);
          console.warn(
            `\n[gen-ai-code] ⚠️ Gemini failed (${geminiMsg}). Checking Groq API fallback...`
          );

          if (getGroqApiKey()) {
            usedProvider = "groq";
            console.log(
              `[gen-ai-code] 🚀 Seamlessly generating with Groq AI (model: ${DEFAULT_GROQ_MODEL})...`
            );
            enqueue(sseEvent("status", { message: "Generating with Groq AI…" }));
            accumulated = await generateGroqCodeStream({
              model: DEFAULT_GROQ_MODEL,
              systemPrompt: SYSTEM_PROMPT,
              messages,
              fileData: fileData ?? null,
              signal: request.signal,
              onStatus: (msg) => enqueue(sseEvent("status", { message: msg })),
            });
            console.log(`[gen-ai-code] ✅ Groq response received (${accumulated.length} chars)`);
          } else {
            throw geminiError;
          }
        }

        // ── Parse and validate the complete JSON response with Zod 4 ─────────
        const jsonResult = extractAndParseJson(accumulated);
        if (!jsonResult.success || !jsonResult.data) {
          console.error(
            "\n" +
              "═".repeat(70) + "\n" +
              "❌ [gen-ai-code] JSON Parse Error\n" +
              `Details: ${jsonResult.error}\n` +
              `Total Length: ${accumulated.length} characters\n` +
              `Accumulated Raw Preview (first 250 chars):\n${accumulated.slice(0, 250)}\n` +
              `Accumulated Raw Preview (last 250 chars):\n${accumulated.slice(-250)}\n` +
              "═".repeat(70) + "\n"
          );
          enqueue(
            sseEvent("error", {
              message: "AI response was incomplete or formatted incorrectly. Please try again.",
            })
          );
          controller.close();
          return;
        }

        const rawParsed = jsonResult.data;

        const aiValidation = aiGeneratedCodeSchema.safeParse(rawParsed);
        if (!aiValidation.success) {
          console.error(
            "\n" +
              "═".repeat(70) + "\n" +
              "❌ [gen-ai-code] AI Schema Validation Failed\n" +
              `Issues: ${JSON.stringify(aiValidation.error.issues, null, 2)}\n` +
              `Raw Parsed: ${JSON.stringify(rawParsed, null, 2).slice(0, 500)}\n` +
              "═".repeat(70) + "\n"
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

        console.log(
          `[gen-ai-code] ✅ Generation successful (${usedProvider.toUpperCase()}) | Workspace ID: ${workspace.id} | Title: "${newFileData.title || "Untitled"}" | Files: ${Object.keys(newFileData.files).length}`
        );

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
          console.log("[gen-ai-code] ⏹️ Generation aborted by client.");
          return;
        }

        console.error(
          "\n" +
            "═".repeat(70) + "\n" +
            "❌ [gen-ai-code] Stream Error\n" +
            `Message: ${err instanceof Error ? err.message : String(err)}\n` +
            `Stack: ${err instanceof Error ? err.stack : "N/A"}\n` +
            "═".repeat(70) + "\n"
        );

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
