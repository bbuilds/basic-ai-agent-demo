import type { ModelMessage } from "ai";

const isToolCallPart = (part: unknown): boolean =>
	typeof part === "object" &&
	part !== null &&
	"type" in part &&
	(part as { type?: string }).type === "tool-call";

const toolCallIdOf = (part: unknown): string | undefined => {
	if (typeof part === "object" && part !== null && "toolCallId" in part) {
		const { toolCallId } = part as { toolCallId?: unknown };
		if (typeof toolCallId === "string") return toolCallId;
	}
	return undefined;
};

/**
 * Filter conversation history to only include compatible message formats.
 * Provider tools (like webSearch) may return messages with formats that
 * cause issues when passed back to subsequent API calls.
 *
 * Tool-call/tool-result pairs are kept together: an assistant message that
 * only contains tool calls survives, and a `tool` message survives only when
 * a surviving assistant message actually emitted its tool call ids. Dropping
 * one half of a pair makes the next request 400.
 */
export const filterCompatibleMessages = (
	messages: ModelMessage[],
): ModelMessage[] => {
	const emittedToolCallIds = new Set<string>();
	const kept: ModelMessage[] = [];

	for (const msg of messages) {
		if (msg.role === "user" || msg.role === "system") {
			kept.push(msg);
			continue;
		}

		if (msg.role === "assistant") {
			const content = msg.content;
			if (typeof content === "string" && content.trim()) {
				kept.push(msg);
				continue;
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
				const hasToolCall = content.some(isToolCallPart);

				if (hasTextContent || hasToolCall) {
					for (const part of content) {
						if (!isToolCallPart(part)) continue;
						const id = toolCallIdOf(part);
						if (id) emittedToolCallIds.add(id);
					}
					kept.push(msg);
				}
			}
			continue;
		}

		if (msg.role === "tool") {
			const content = msg.content;
			if (!Array.isArray(content)) continue;
			const ids = content
				.map(toolCallIdOf)
				.filter((id): id is string => id !== undefined);
			if (ids.length && ids.every((id) => emittedToolCallIds.has(id))) {
				kept.push(msg);
			}
		}
	}

	return kept;
};
