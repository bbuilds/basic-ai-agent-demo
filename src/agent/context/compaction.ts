import { openai } from "@ai-sdk/openai";
import { generateText, type ModelMessage } from "ai";
import { extractMessageText } from "./tokenEstimator.ts";

const SUMMARIZATION_PROMPT = `Summarize this conversation for continuity. Include:
1) What was accomplished
2) Current state
3) Key decisions made
4) Pending tasks or questions

Be concise. The summary should allow the conversation to continue naturally.

Conversation to summarize:
`;

/**
 * Format messages array as readable text for summarization
 */
function messagesToText(messages: ModelMessage[]): string {
	return messages
		.map((msg) => {
			const role = msg.role.toUpperCase();
			const content = extractMessageText(msg);
			return `[${role}]: ${content}`;
		})
		.join("\n\n");
}

/**
 * Compact a conversation by summarizing it with an LLM.
 *
 * Takes the current messages (excluding system prompt) and returns a new
 * messages array with:
 * - A user message containing the summary
 * - An assistant acknowledgment
 *
 * The system prompt should be prepended by the caller.
 */
export async function compactConversation(
	messages: ModelMessage[],
	model: string,
): Promise<ModelMessage[]> {
	const nonSystemMessages = messages.filter((msg) => msg.role !== "system");

	if (nonSystemMessages.length === 0) {
		return [];
	}

	const conversationText = messagesToText(nonSystemMessages);

	const { text: summary } = await generateText({
		model: openai(model),
		prompt: `${SUMMARIZATION_PROMPT}${conversationText}`,
	});

	return [
		{
			role: "user",
			content: `Here is a summary of our conversation so far:\n\n${summary}`,
		},
		{
			role: "assistant",
			content:
				"Got it, I have the context from our conversation so far. Let's continue.",
		},
	];
}
