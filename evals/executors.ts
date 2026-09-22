import { openai } from "@ai-sdk/openai";
import { generateText, type ModelMessage, stepCountIs } from "ai";
import { SYSTEM_PROMPT } from "../src/agent/system/prompt.ts";
import { AGENT_MODEL, MAX_STEPS } from "../src/config.ts";
import type {
	EvalData,
	MultiTurnEvalData,
	MultiTurnResult,
	SingleTurnResult,
} from "./types.ts";
import { buildMessages, buildMockedTools, pickTools } from "./utils.ts";

// A minimal single-turn chat
export const singleTurnExecutorWithMocks = async (
	data: EvalData,
): Promise<SingleTurnResult> => {
	const messages = buildMessages(data);
	const tools = pickTools(data.tools);

	try {
		const { toolCalls: rawToolCalls } = await generateText({
			model: openai(data.config?.model ?? AGENT_MODEL),
			instructions: data.systemPrompt ?? SYSTEM_PROMPT,
			messages,
			tools,
			stopWhen: stepCountIs(1),
			temperature: data.config?.temperature ?? undefined,
		});

		const toolCalls = rawToolCalls.map((call) => ({
			toolName: call.toolName,
			args: call.input,
		}));

		const toolNames = rawToolCalls.map((call) => call.toolName);
		return { toolCalls, toolNames, selectedAny: toolNames.length > 0 };
	} catch (err) {
		throw new Error(
			`singleTurnExecutorWithMocks failed for prompt "${data.prompt}": ${
				err instanceof Error ? err.message : String(err)
			}`,
			{ cause: err },
		);
	}
};

/**
 * Multi-turn executor with mocked tools.
 * Runs a complete agent loop with tools returning fixed values.
 */
export async function multiTurnWithMocks(
	data: MultiTurnEvalData,
): Promise<MultiTurnResult> {
	const tools = buildMockedTools(data.mockTools);

	let messages: ModelMessage[];
	if (data.messages) {
		messages = data.messages;
	} else if (data.prompt) {
		messages = [{ role: "user", content: data.prompt }];
	} else {
		throw new Error(
			"Multi-turn eval entry needs either `messages` or `prompt`",
		);
	}

	try {
		const result = await generateText({
			model: openai(data.config?.model ?? AGENT_MODEL),
			instructions: SYSTEM_PROMPT,
			messages,
			tools,
			stopWhen: stepCountIs(data.config?.maxSteps ?? MAX_STEPS),
			temperature: data.config?.temperature ?? undefined,
		});

		// Extract all tool calls in order from steps
		const allToolCalls: string[] = [];
		const steps = result.steps.map((step) => {
			const stepToolCalls = (step.toolCalls ?? []).map((tc) => {
				allToolCalls.push(tc.toolName);
				return {
					toolCallId: tc.toolCallId,
					toolName: tc.toolName,
					args: tc.input,
				};
			});

			const stepToolResults = (step.toolResults ?? []).map((tr) => ({
				toolCallId: tr.toolCallId,
				toolName: tr.toolName,
				result: tr.output,
			}));

			return {
				toolCalls: stepToolCalls.length > 0 ? stepToolCalls : undefined,
				toolResults: stepToolResults.length > 0 ? stepToolResults : undefined,
				text: step.text || undefined,
			};
		});

		// Extract unique tools used
		const toolsUsed = [...new Set(allToolCalls)];

		return {
			text: result.text,
			steps,
			toolsUsed,
			toolCallOrder: allToolCalls,
		};
	} catch (err) {
		const label = data.prompt ?? "(pre-filled message history)";
		throw new Error(
			`multiTurnWithMocks failed for prompt "${label}": ${
				err instanceof Error ? err.message : String(err)
			}`,
			{ cause: err },
		);
	}
}
