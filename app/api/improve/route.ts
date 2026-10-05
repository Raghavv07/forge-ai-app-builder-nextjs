import { getCurrentAuthUser } from "@/lib/auth-helper";
import { NextRequest } from "next/server";
import { Agent, createTool } from "@cline/sdk";
import { z } from "zod";
import { db, type Prisma } from "@/lib/prisma";
import { aj } from "@/lib/arcjet";
import { improveRequestSchema, type FileData } from "@/types/workspace";

// ─── SSE helper ───────────────────────────────────────────────────────────────

function sseEvent(type: string, payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify({ type, ...payload })}\n\n`;
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const authUser = await getCurrentAuthUser();
  if (!authUser)
    return Response.json({ message: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { message: "Invalid JSON in request body" },
      { status: 400 }
    );
  }

  const parsed = improveRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        message: "Invalid request payload",
        error: z.prettifyError(parsed.error),
      },
      { status: 400 }
    );
  }

  const { userId, workspaceId, userRequest, fileData } = parsed.data;

  // ── Arcjet: rate limit & prompt injection protection ─────────────────────
  if (aj) {
    const decision = await aj.protect(request, {
      requested: 1,
      userId: authUser.clerkId,
      detectPromptInjectionMessage: userRequest,
    });

    if (decision.isDenied()) {
      if (decision.reason.isRateLimit()) {
        return Response.json(
          {
            message:
              "Too many improvement requests. Please wait a minute before requesting again.",
          },
          { status: 429 }
        );
      }
      if (decision.reason.isPromptInjection()) {
        return Response.json(
          {
            message:
              "Prompt injection detected. Improvement request rejected for security.",
          },
          { status: 400 }
        );
      }
      return Response.json(
        { message: "Request blocked by security policy." },
        { status: 403 }
      );
    }
  }

  // ── Auth verification ──────────────────────────────────────────────────────

  const user = await db.user.findUnique({
    where: { id: userId, clerkId: authUser.clerkId },
    select: { id: true },
  });

  if (!user)
    return Response.json({ message: "User not found" }, { status: 404 });

  // ── Gemini API Key verification ──────────────────────────────────────────
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return Response.json(
      { message: "Gemini API key is not configured on the server." },
      { status: 500 }
    );
  }

  // ── Build the agent ────────────────────────────────────────────────────────

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;
      const safeEnqueue = (chunk: string) => {
        if (isClosed || request.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          isClosed = true;
        }
      };

      // Accumulate file patches as the agent calls update_file
      const patchedFiles: Record<string, { code: string }> = {
        ...fileData.files,
      };
      let finalSummary = "";

      // ── Tool 1: update_file ──────────────────────────────────────────────
      // The agent calls this once per file it wants to change.
      // We immediately emit a file_patch SSE event so Sandpack
      // updates live in the browser as each file is patched.

      const updateFileTool = createTool({
        name: "update_file",
        description:
          "Update or rewrite a file in the React sandbox. Call once per file you need to change. Always provide complete, non-truncated file contents.",
        inputSchema: z.object({
          path: z
            .string()
            .describe("File path exactly as it appears, e.g. /App.js or /components/Header.jsx"),
          code: z.string().describe("Complete new contents of the file"),
          reason: z
            .string()
            .describe("One sentence explaining what you changed and why"),
        }),
        async execute({ path, code, reason }, context) {
          if (context.signal?.aborted || request.signal.aborted) {
            return {
              output: { error: "Execution aborted by client." },
              isError: true,
            };
          }

          // Normalize path: ensure leading slash and prevent path traversal
          const normalizedPath = path.startsWith("/") ? path : `/${path}`;
          if (normalizedPath.includes("..")) {
            return {
              output: { error: "Path traversal is not permitted in sandbox." },
              isError: true,
            };
          }

          if (!code || typeof code !== "string") {
            return {
              output: { error: "File code content must be a non-empty string." },
              isError: true,
            };
          }

          patchedFiles[normalizedPath] = { code };
          // Emit live patch — client applies it to Sandpack immediately
          safeEnqueue(sseEvent("file_patch", { path: normalizedPath, code, reason }));
          return {
            output: `Successfully updated ${normalizedPath}: ${reason}`,
            isError: false,
          };
        },
      });

      // ── Tool 2: done_improving ───────────────────────────────────────────
      // Agent calls this when all files are updated.
      // lifecycle.completesRun: true tells the Cline SDK loop to stop
      // immediately after this tool runs instead of continuing iterations.

      const doneImprovingTool = createTool({
        name: "done_improving",
        description:
          "Call this when you have finished making all improvements to conclude the session.",
        inputSchema: z.object({
          summary: z
            .string()
            .describe(
              "A short friendly summary of all the improvements you made (1-3 sentences)"
            ),
        }),
        lifecycle: { completesRun: true },
        async execute({ summary }) {
          finalSummary = summary;
          return {
            output: "Done improving.",
            isError: false,
          };
        },
      });

      // ── Serialize current files for context ──────────────────────────────
      // We give the agent all current files as context in the system prompt
      // so it knows exactly what it's working with.

      const fileContext = Object.entries(fileData.files)
        .map(([path, { code }]) => `// ${path}\n${code}`)
        .join("\n\n---\n\n");

      const agent = new Agent({
        providerId: "gemini",
        modelId: "gemini-3.5-flash",
        apiKey,
        maxIterations: 8,
        systemPrompt: `You are an expert React developer improving a live browser preview app.

The app uses React (functional components), Tailwind CSS for styling, and runs in Sandpack.
You CANNOT use TypeScript, CSS modules, or real npm install — only what's already available.
Available packages: react, react-dom, tailwindcss (CDN), lucide-react, recharts, react-router-dom, framer-motion, motion, date-fns, zod, react-hook-form.

Here are the current files:

${fileContext}

WORKFLOW:
1. Understand what the user wants improved.
2. Identify which files need to change.
3. Call update_file for each file that needs changes (always include the COMPLETE file, not just the diff).
4. Once all files are updated, call done_improving with a short summary.

RULES:
- Always write complete file contents — never partial snippets.
- Keep all existing functionality unless asked to remove it.
- The entry point is always /App.js with a default export.
- All imports must reference files you've updated or packages in the available list above.`,
        tools: [updateFileTool, doneImprovingTool],
        // Auto-approve both tools — no human-in-the-loop needed in this sandbox context
        toolPolicies: {
          update_file: { autoApprove: true },
          done_improving: { autoApprove: true },
        },
      });

      // ── Abort Listener for Client Disconnect ────────────────────────────
      const abortListener = () => {
        try {
          agent.abort("Client disconnected / aborted request");
        } catch {
          // ignore
        }
      };
      request.signal.addEventListener("abort", abortListener);

      // ── Stream agent reasoning & events to chat panel ───────────────────
      const unsubscribe = agent.subscribe((event) => {
        if (
          (event.type === "assistant-text-delta" ||
            event.type === "assistant-reasoning-delta") &&
          event.text
        ) {
          safeEnqueue(sseEvent("thinking", { text: event.text }));
        }

        // Tool lifecycle events
        if (event.type === "tool-started") {
          const name = event.toolCall?.toolName;
          if (name === "update_file") {
            const rawPath =
              (event.toolCall?.input as { path?: string })?.path ?? "a file";
            safeEnqueue(
              sseEvent("thinking", { text: `\n\nUpdating \`${rawPath}\`…` })
            );
          } else if (name === "done_improving") {
            safeEnqueue(
              sseEvent("thinking", { text: "\n\nFinalizing improvements…" })
            );
          }
        }

        if (event.type === "tool-finished") {
          const name = event.toolCall?.toolName;
          if (name === "update_file") {
            const rawPath =
              (event.toolCall?.input as { path?: string })?.path ?? "a file";
            safeEnqueue(
              sseEvent("thinking", { text: `\n✓ Updated \`${rawPath}\`\n\n` })
            );
          }
        }
      });

      try {
        if (request.signal.aborted) {
          agent.abort("Request already aborted");
          return;
        }

        safeEnqueue(sseEvent("status", { message: "Cline agent starting…" }));

        const result = await agent.run(userRequest);

        // Check if run was aborted by client stop / disconnect
        if (result.status === "aborted" || request.signal.aborted) {
          console.log("[improve] Agent run aborted by client.");
          return;
        }

        if (result.status === "failed") {
          throw new Error(result.error?.message ?? "Agent run failed");
        }

        // ── Save to DB ────────────────────────────────────────────────────

        const newFileData: FileData = {
          files: patchedFiles,
          dependencies: fileData.dependencies,
          title: fileData.title,
        };

        await db.workspace.update({
          where: { id: workspaceId, userId },
          data: { fileData: newFileData as unknown as Prisma.InputJsonValue },
        });

        // ── Final done event ──────────────────────────────────────────────

        safeEnqueue(
          sseEvent("done", {
            fileData: newFileData,
            summary: finalSummary || result.outputText,
          })
        );
      } catch (err) {
        console.error("[improve] error:", err);
        safeEnqueue(
          sseEvent("error", {
            message:
              err instanceof Error ? err.message : "Something went wrong.",
          })
        );
      } finally {
        unsubscribe();
        request.signal.removeEventListener("abort", abortListener);
        if (!isClosed) {
          try {
            controller.close();
          } catch {
            // ignore if already closed
          }
          isClosed = true;
        }
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
