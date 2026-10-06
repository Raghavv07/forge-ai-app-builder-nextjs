// WorkspaceClient.tsx
"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { ChatPanel } from "./ChatPanel";
import { MobileBlocker } from "./MobileBlocker";

const CodePanel = dynamic(
  () => import("./CodePanel").then((mod) => mod.CodePanel),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-1 items-center justify-center bg-[#0a0a0a]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          <p className="text-xs text-white/40">Loading sandbox environment…</p>
        </div>
      </div>
    ),
  }
);
import { toast } from "sonner";
import type {
  Message,
  FileData,
  StatusStep,
  WorkspaceData,
} from "@/types/workspace";
import { isMessage, isFileData } from "@/types/workspace";

export type {
  MessageRole,
  Message,
  FileData,
  StatusStep,
} from "@/types/workspace";

interface WorkspaceClientProps {
  initialPrompt: string | null;
  workspace: WorkspaceData | null;
  userId: string;
}

function parseMessages(raw: unknown): Message[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isMessage);
}

function parseFileData(raw: unknown): FileData | null {
  return isFileData(raw) ? raw : null;
}

export function WorkspaceClient({
  initialPrompt,
  workspace,
  userId,
}: WorkspaceClientProps) {
  const [workspaceId, setWorkspaceId] = useState<string | null>(
    workspace?.id ?? null
  );
  const [messages, setMessages] = useState<Message[]>(
    parseMessages(workspace?.messages)
  );
  const [fileData, setFileData] = useState<FileData | null>(
    parseFileData(workspace?.fileData)
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusLog, setStatusLog] = useState<StatusStep[]>([]);
  const [isImproving, setIsImproving] = useState(false);

  // AbortController refs — used to cancel in-flight streams
  const generateAbortRef = useRef<AbortController | null>(null);
  const improveAbortRef = useRef<AbortController | null>(null);

  // Refs to avoid stale closures in callbacks
  const messagesRef = useRef<Message[]>(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const workspaceIdRef = useRef<string | null>(workspaceId);
  useEffect(() => {
    workspaceIdRef.current = workspaceId;
  }, [workspaceId]);

  // fileData ref — so handleImprove never closes over stale fileData
  // even as file_patch events stream in
  const fileDataRef = useRef<FileData | null>(fileData);
  useEffect(() => {
    fileDataRef.current = fileData;
  }, [fileData]);

  const pushStep = (label: string) => {
    setStatusLog((prev) => [
      ...prev.map((s, i) =>
        i === prev.length - 1 ? { ...s, status: "done" as const } : s
      ),
      { label, status: "running" as const },
    ]);
  };

  const completeSteps = () => {
    setStatusLog((prev) =>
      prev.map((s, i) =>
        i === prev.length - 1 ? { ...s, status: "done" as const } : s
      )
    );
  };

  const handleGenerate = useCallback(
    async (prompt: string, imageUrl?: string) => {
      if (isGenerating) return;

      const userMessage: Message = {
        role: "user",
        content: prompt,
        ...(imageUrl ? { imageUrl } : {}),
      };

      const currentMessages = messagesRef.current;
      const currentWorkspaceId = workspaceIdRef.current;

      setMessages((prev) => [...prev, userMessage]);
      setIsGenerating(true);
      setStatusLog([{ label: "Thinking…", status: "running" }]);

      // Create a fresh AbortController for this request
      const abortController = new AbortController();
      generateAbortRef.current = abortController;

      try {
        const conversationHistory = [...currentMessages, userMessage];

        const res = await fetch("/api/gen-ai-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abortController.signal,
          body: JSON.stringify({
            workspaceId: currentWorkspaceId,
            userId,
            messages: conversationHistory,
            fileData: fileDataRef.current,
          }),
        });

        if (res.status === 429) {
          const msg = "Too many requests. Please wait a minute before trying again.";
          toast.error(msg);
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: `⚠️ ${msg}` },
          ]);
          return;
        }
        if (!res.ok || !res.body) {
          const errData = await res.json().catch(() => null);
          const errorMsg =
            errData?.message ||
            (typeof errData?.error === "string" ? errData.error : null) ||
            "Generation failed";
          throw new Error(errorMsg);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === "status") {
                pushStep(event.message);
              } else if (event.type === "done") {
                completeSteps();
                setWorkspaceId(event.workspaceId);
                setFileData(event.fileData);
                setMessages((prev) => [
                  ...prev,
                  { role: "assistant", content: event.assistantMessage },
                ]);
                window.history.replaceState(
                  null,
                  "",
                  `/workspace?id=${event.workspaceId}`
                );
              } else if (event.type === "error") {
                const errMsg = event.message || "Generation failed. Please try again.";
                toast.error(errMsg);
                setMessages((prev) => [
                  ...prev,
                  { role: "assistant", content: `⚠️ ${errMsg}` },
                ]);
                return;
              }
            } catch {
              // skip malformed SSE lines
            }
          }
        }

        // Process any remaining data in the buffer after stream ends
        if (buffer.trim() && buffer.startsWith("data: ")) {
          try {
            const event = JSON.parse(buffer.slice(6));
            if (event.type === "done") {
              completeSteps();
              setWorkspaceId(event.workspaceId);
              setFileData(event.fileData);
              setMessages((prev) => [
                ...prev,
                { role: "assistant", content: event.assistantMessage },
              ]);
              window.history.replaceState(
                null,
                "",
                `/workspace?id=${event.workspaceId}`
              );
            } else if (event.type === "error") {
              const errMsg = event.message || "Generation failed. Please try again.";
              toast.error(errMsg);
              setMessages((prev) => [
                ...prev,
                { role: "assistant", content: `⚠️ ${errMsg}` },
              ]);
              return;
            }
          } catch {
            // ignore malformed trailing buffer
          }
        }
      } catch (err) {
        // User-initiated stop
        if (err instanceof Error && err.name === "AbortError") {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "⏹️ Generation stopped." },
          ]);
          return;
        }
        console.warn("[WorkspaceClient] Generation error:", err instanceof Error ? err.message : err);
        const errMsg = err instanceof Error ? err.message : "Something went wrong.";
        toast.error(errMsg);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `⚠️ ${errMsg}` },
        ]);
      } finally {
        generateAbortRef.current = null;
        setIsGenerating(false);
        setStatusLog([]);
      }
    },
    [isGenerating, userId]
    // fileData intentionally omitted — read via fileDataRef
  );

  const handleImprove = useCallback(
    async (userRequest: string) => {
      if (isGenerating || isImproving) return;
      if (!workspaceIdRef.current) return;

      // Read fileData from ref — never stale, never causes recreating this fn
      const currentFileData = fileDataRef.current;
      if (!currentFileData) return;

      setIsImproving(true);

      setMessages((prev) => [
        ...prev,
        { role: "user", content: userRequest },
        { role: "assistant", content: "" }, // placeholder, updated live
      ]);

      // Create a fresh AbortController for this request
      const abortController = new AbortController();
      improveAbortRef.current = abortController;

      try {
        const res = await fetch("/api/improve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abortController.signal,
          body: JSON.stringify({
            userId,
            workspaceId: workspaceIdRef.current,
            userRequest,
            fileData: currentFileData,
          }),
        });

        if (!res.ok || !res.body) {
          const errData = await res.json().catch(() => null);
          const errorMsg =
            errData?.message ||
            (typeof errData?.error === "string" ? errData.error : null) ||
            "Improve failed";
          throw new Error(errorMsg);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulatedThinking = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(line.slice(6));

              if (event.type === "thinking") {
                // Stream agent reasoning into the placeholder assistant message
                accumulatedThinking += event.text;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: "assistant",
                    content: accumulatedThinking,
                  };
                  return updated;
                });
              } else if (event.type === "file_patch") {
                // Live update fileData so Sandpack updates preview incrementally
                setFileData((prev) => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    files: {
                      ...prev.files,
                      [event.path]: { code: event.code },
                    },
                  };
                });
              } else if (event.type === "done") {
                // Apply all final files and summary once stream finishes
                setFileData(event.fileData);
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: "assistant",
                    content: event.summary,
                  };
                  return updated;
                });
              } else if (event.type === "error") {
                const errMsg = event.message || "Improve failed. Please try again.";
                toast.error(errMsg);
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: "assistant",
                    content: `⚠️ ${errMsg}`,
                  };
                  return updated;
                });
                return;
              }
            } catch {
              // skip malformed SSE lines
            }
          }
        }

        // Process any remaining data in the buffer after stream ends
        if (buffer.trim() && buffer.startsWith("data: ")) {
          try {
            const event = JSON.parse(buffer.slice(6));
            if (event.type === "done") {
              setFileData(event.fileData);
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: event.summary,
                };
                return updated;
              });
            } else if (event.type === "error") {
              const errMsg = event.message || "Improve failed. Please try again.";
              toast.error(errMsg);
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: `⚠️ ${errMsg}`,
                };
                return updated;
              });
              return;
            }
          } catch {
            // ignore malformed trailing buffer
          }
        }
      } catch (err) {
        // User-initiated stop — roll back or mark stopped
        if (err instanceof Error && err.name === "AbortError") {
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: "⏹️ Improvement stopped.",
            };
            return updated;
          });
          return;
        }
        console.warn("[WorkspaceClient] Improve error:", err instanceof Error ? err.message : err);
        const errMsg = err instanceof Error ? err.message : "Improve failed.";
        toast.error(errMsg);
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: `⚠️ ${errMsg}`,
          };
          return updated;
        });
      } finally {
        improveAbortRef.current = null;
        setIsImproving(false);
      }
    },
    // fileData intentionally omitted — read via fileDataRef above
    [isGenerating, isImproving, userId]
  );

  // Cancel whichever stream is currently in-flight
  const handleStop = useCallback(() => {
    generateAbortRef.current?.abort();
    improveAbortRef.current?.abort();
  }, []);

  const handleFilePatch = useCallback((patches: FileData) => {
    setFileData(patches);
  }, []);

  return (
    <>
      {/* Mobile blocker — visible only on small screens */}
      <div className="md:hidden">
        <MobileBlocker />
      </div>

      {/* Workspace — visible only on md+ screens */}
      <div className="hidden md:flex h-[calc(100vh-4rem)] overflow-hidden bg-[#0a0a0a]">
        <ChatPanel
          isImproving={isImproving}
          messages={messages}
          isGenerating={isGenerating}
          statusLog={statusLog}
          initialPrompt={initialPrompt}
          onGenerate={handleGenerate}
          onStop={handleStop}
          userId={userId}
          workspaceId={workspaceId}
          appTitle={fileData?.title ?? workspace?.title ?? null}
        />
        <div className="w-px shrink-0 bg-white/6" />
        <CodePanel
          fileData={fileData}
          isGenerating={isGenerating}
          statusLog={statusLog}
          onImprove={handleImprove}
          onFixError={(error) =>
            handleGenerate(
              `There is an error in the preview:\n\n\`\`\`\n${error}\n\`\`\`\n\nPlease fix it.`
            )
          }
          onFilePatch={handleFilePatch}
          appTitle={fileData?.title ?? workspace?.title ?? null}
          isImproving={isImproving}
          workspaceId={workspaceId}
          userId={userId}
        />
      </div>
    </>
  );
}
