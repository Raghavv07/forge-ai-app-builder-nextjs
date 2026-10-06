import type { Message, FileData } from "@/types/workspace";

export const DEFAULT_GROQ_MODEL =
  process.env.GROQ_MODEL || "openai/gpt-oss-120b";

export function getGroqApiKey(): string | null {
  return process.env.GROQ_API_KEY || null;
}

export interface GroqStreamOptions {
  model?: string;
  systemPrompt: string;
  messages: Message[];
  fileData?: FileData | null;
  signal?: AbortSignal;
  onStatus?: (status: string) => void;
}

export async function generateGroqCodeStream({
  model = DEFAULT_GROQ_MODEL,
  systemPrompt,
  messages,
  fileData,
  signal,
  onStatus,
}: GroqStreamOptions): Promise<string> {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured in environment variables.");
  }

  onStatus?.("Connecting to Groq AI…");

  // Format messages for OpenAI / Groq standard schema
  const formattedMessages: { role: string; content: string }[] = [
    { role: "system", content: systemPrompt },
  ];

  messages.forEach((msg, idx) => {
    let content = msg.content;
    const isLast = idx === messages.length - 1;

    if (msg.role === "user" && isLast && fileData) {
      content +=
        "\n\nCurrent project files for context:\n" +
        JSON.stringify(fileData, null, 2);
    }

    formattedMessages.push({
      role: msg.role === "assistant" ? "assistant" : "user",
      content,
    });
  });

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal,
    body: JSON.stringify({
      model,
      messages: formattedMessages,
      temperature: 0.4,
      max_tokens: 8192,
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    const errText = await response.text().catch(() => "");
    throw new Error(
      `Groq API Error (${response.status}): ${errText || response.statusText}`
    );
  }

  onStatus?.("Streaming response from Groq…");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = "";
  let buffer = "";
  let lastReasoningStatus = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      if (trimmed === "data: [DONE]") break;

      try {
        const parsed = JSON.parse(trimmed.slice(6));
        const delta = parsed.choices?.[0]?.delta;

        // If the model streams reasoning chunks, display status
        if (delta?.reasoning && onStatus) {
          const now = Date.now();
          if (now - lastReasoningStatus > 600) {
            const shortThought = String(delta.reasoning).trim().slice(0, 40);
            if (shortThought.length > 5) {
              onStatus(`Thinking: ${shortThought}…`);
              lastReasoningStatus = now;
            }
          }
        }

        if (delta?.content) {
          accumulated += delta.content;
        }
      } catch {
        // ignore malformed SSE line
      }
    }
  }

  if (buffer.trim() && buffer.startsWith("data: ") && buffer.trim() !== "data: [DONE]") {
    try {
      const parsed = JSON.parse(buffer.slice(6));
      const delta = parsed.choices?.[0]?.delta;
      if (delta?.content) accumulated += delta.content;
    } catch {}
  }

  return accumulated;
}
