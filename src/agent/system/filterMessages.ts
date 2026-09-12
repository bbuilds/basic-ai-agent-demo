import type { ModelMessage } from "ai";
/**
 * Filter conversation history to only include compatible message formats.
 * Provider tools (like webSearch) may return messages with formats that
 * cause issues when passed back to subsequent API calls.
 */
export const filterCompatibleMessages = (
  messages: ModelMessage[],
): ModelMessage[] => {
  return messages.filter((msg) => {
    if (msg.role === "user" || msg.role === "system") {
      return true;
    }

    if (msg.role === "assistant") {
      const content = msg.content;
      if (typeof content === "string" && content.trim()) {
        return true;
      }
      if (Array.isArray(content)) {
        const hasTextContent = content.some((part: unknown) => {
          if (typeof part === "string" && part.trim()) return true;
          if (typeof part === "object" && part !== null && "text" in part) {
            const textPart = part as { text?: string };
            return textPart.text?.trim();
          }
          return false;
        });
        return hasTextContent;
      }
    }

    if (msg.role === "tool") {
      return true;
    }

    return false;
  });
};
