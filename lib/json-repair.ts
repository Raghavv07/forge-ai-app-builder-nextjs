/**
 * Robust JSON extraction and repair utility for AI-generated responses.
 */

export function extractAndParseJson<T = unknown>(rawText: string): {
  success: boolean;
  data?: T;
  error?: string;
  cleanedText: string;
} {
  if (!rawText || typeof rawText !== "string") {
    return {
      success: false,
      error: "Empty or non-string input provided",
      cleanedText: "",
    };
  }

  // 1. Remove XML/thought blocks if present
  let cleaned = rawText
    .replace(/<thought>[\s\S]*?<\/thought>/gi, "")
    .replace(/\*\*Thought:\*\*[\s\S]*?(?=\{)/i, "")
    .trim();

  // 2. Strip Markdown code fences
  const jsonBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (jsonBlockMatch && jsonBlockMatch[1]) {
    cleaned = jsonBlockMatch[1].trim();
  } else {
    cleaned = cleaned
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }

  // 3. Extract the outermost JSON object: from first '{' to last '}'
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  } else if (firstBrace !== -1) {
    // Truncated response that started with '{' but didn't close
    cleaned = cleaned.substring(firstBrace);
  }

  // Attempt 1: Direct JSON.parse
  try {
    const data = JSON.parse(cleaned) as T;
    return { success: true, data, cleanedText: cleaned };
  } catch (err1) {
    const parseError = err1 instanceof Error ? err1.message : String(err1);

    // Attempt 2: Repair common JSON syntax flaws
    const repaired = repairJsonString(cleaned);
    try {
      const data = JSON.parse(repaired) as T;
      console.log("[json-repair] Successfully repaired and parsed JSON response.");
      return { success: true, data, cleanedText: repaired };
    } catch {
      // Attempt 3: Truncated JSON repair (balance unclosed braces/brackets/quotes)
      const balanced = balanceJsonBrackets(repaired);
      try {
        const data = JSON.parse(balanced) as T;
        console.log("[json-repair] Successfully balanced truncated JSON response.");
        return { success: true, data, cleanedText: balanced };
      } catch (err3) {
        return {
          success: false,
          error: `JSON parse failed: ${parseError}`,
          cleanedText: cleaned,
        };
      }
    }
  }
}

/**
 * Repairs trailing commas, unescaped newlines/tabs in string literals, etc.
 */
function repairJsonString(json: string): string {
  let result = json;

  // 1. Remove trailing commas before } or ]
  result = result.replace(/,\s*([}\]])/g, "$1");

  // 2. Replace unescaped control characters inside quotes
  let inString = false;
  let isEscaped = false;
  let fixed = "";

  for (let i = 0; i < result.length; i++) {
    const char = result[i];

    if (char === '"' && !isEscaped) {
      inString = !inString;
      fixed += char;
    } else if (inString) {
      if (char === "\n") {
        fixed += "\\n";
      } else if (char === "\r") {
        fixed += "\\r";
      } else if (char === "\t") {
        fixed += "\\t";
      } else if (char === "\b") {
        fixed += "\\b";
      } else if (char === "\f") {
        fixed += "\\f";
      } else {
        fixed += char;
      }
    } else {
      fixed += char;
    }

    if (char === "\\" && !isEscaped) {
      isEscaped = true;
    } else {
      isEscaped = false;
    }
  }

  return fixed;
}

/**
 * Automatically closes unclosed quotes, brackets, and braces in truncated JSON.
 */
function balanceJsonBrackets(json: string): string {
  let inString = false;
  let isEscaped = false;
  const stack: string[] = [];

  for (let i = 0; i < json.length; i++) {
    const char = json[i];

    if (char === '"' && !isEscaped) {
      inString = !inString;
    } else if (!inString) {
      if (char === "{" || char === "[") {
        stack.push(char);
      } else if (char === "}") {
        if (stack.length > 0 && stack[stack.length - 1] === "{") {
          stack.pop();
        }
      } else if (char === "]") {
        if (stack.length > 0 && stack[stack.length - 1] === "[") {
          stack.pop();
        }
      }
    }

    if (char === "\\" && !isEscaped) {
      isEscaped = true;
    } else {
      isEscaped = false;
    }
  }

  let balanced = json;

  // If we ended inside a string, close the string quote
  if (inString) {
    balanced += '"';
  }

  // Remove trailing commas after closing unclosed string
  balanced = balanced.replace(/,\s*$/, "");

  // Close remaining open brackets/braces in reverse order
  while (stack.length > 0) {
    const open = stack.pop();
    if (open === "{") {
      balanced = balanced.replace(/,\s*$/, "") + "}";
    } else if (open === "[") {
      balanced = balanced.replace(/,\s*$/, "") + "]";
    }
  }

  return balanced;
}
