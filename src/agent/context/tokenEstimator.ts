import type { ModelMessage } from "ai";

export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 3.75);
}

/**
 * Extract a readable text representation from a ModelMessage's content,
 * regardless of whether it's a plain string or an array of parts
 * (text, tool-call, tool-result, etc).
 */
export function extractMessageText(msg: ModelMessage): string {
	const { content } = msg;

	if (typeof content === "string") {
		return content;
	}

	if (!Array.isArray(content)) {
		return "";
	}

	return content
		.map((part) => {
			if (typeof part === "string") return part;
			if (typeof part !== "object" || part === null) return "";

			const typed = part as {
				type?: string;
				text?: string;
				toolName?: string;
				input?: unknown;
				output?: unknown;
			};

			if (typed.type === "text" && typeof typed.text === "string") {
				return typed.text;
			}
			if (typed.type === "tool-call") {
				return `[called tool: ${typed.toolName}(${JSON.stringify(typed.input)})]`;
			}
			if (typed.type === "tool-result") {
				return `[tool result from ${typed.toolName}: ${JSON.stringify(typed.output)}]`;
			}
			return "";
		})
		.filter(Boolean)
		.join("\n");
}

export interface TokenUsage {
	input: number;
	output: number;
	total: number;
}

/**
 * Estimate token counts for an array of messages.
 * Separates input (user, system, tool) from output (assistant) tokens.
 */
export function estimateMessagesTokens(messages: ModelMessage[]): TokenUsage {
	let input = 0;
	let output = 0;

	for (const message of messages) {
		const text = extractMessageText(message);
		const tokens = estimateTokens(text);

		if (message.role === "assistant") {
			output += tokens;
		} else {
			// system, user, tool messages count as input
			input += tokens;
		}
	}

	return {
		input,
		output,
		total: input + output,
	};
}
