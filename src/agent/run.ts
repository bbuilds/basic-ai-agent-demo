import path from "node:path";
import { fileURLToPath } from "node:url";
import { openai } from "@ai-sdk/openai";
import { Laminar, LaminarAiSdkTelemetry } from "@lmnr-ai/lmnr";
import { type ModelMessage, registerTelemetry, streamText } from "ai";
import dotenv from "dotenv";
import type { AgentCallbacks, ToolCallInfo } from "../types.ts";

import {
	calculateUsagePercentage,
	compactConversation,
	DEFAULT_THRESHOLD,
	estimateMessagesTokens,
	getModelLimits,
	isOverThreshold,
} from "./context/index.ts";

// Load the .env that ships next to this package, so `demo-agent` works when
// installed globally and run from any directory (not just the repo root).
// `dist/agent/run.js` -> `<package root>/.env`
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(moduleDir, "../../.env"), quiet: true });
// If the caller's cwd also has a .env (e.g. running from inside the repo
// during development), let it override the bundled one.
dotenv.config({ override: true, quiet: true });

import { executeTool } from "./executeTool.ts";
import { filterCompatibleMessages } from "./system/filterMessages.ts";
import { SYSTEM_PROMPT } from "./system/prompt.ts";

import { modelTools } from "./tools/index.ts";

const MODEL_NAME = process.env.AGENT_MODEL ?? "gpt-5.6-luna";
const MAX_STEPS = 25;
const SYSTEM_MESSAGE: ModelMessage = { role: "system", content: SYSTEM_PROMPT };

Laminar.initialize({ projectApiKey: process.env.LMNR_API_KEY });
registerTelemetry(new LaminarAiSdkTelemetry());

export async function shutdownAgent(): Promise<void> {
	await Laminar.shutdown();
}

function summarizeProviderOutput(output: unknown): string {
	if (typeof output === "string") return output;
	return JSON.stringify(output) ?? "done";
}

export async function runAgent(
	userMessage: string,
	conversationHistory: ModelMessage[],
	callbacks: AgentCallbacks,
): Promise<ModelMessage[]> {
	const modelLimits = getModelLimits(MODEL_NAME);
	let workingHistory = filterCompatibleMessages(conversationHistory);

	const estimateRequest = (msgs: ModelMessage[]) =>
		estimateMessagesTokens([SYSTEM_MESSAGE, ...msgs]);

	const userTurn: ModelMessage = { role: "user", content: userMessage };
	const preCheckTokens = estimateRequest([...workingHistory, userTurn]);
	if (isOverThreshold(preCheckTokens.total, modelLimits.inputLimit)) {
		workingHistory = await compactConversation(workingHistory, MODEL_NAME);
	}

	const messages: ModelMessage[] = [...workingHistory, userTurn];

	const reportTokenUsage = () => {
		if (!callbacks.onTokenUsage) return;
		const usage = estimateRequest(messages);
		callbacks.onTokenUsage({
			inputTokens: usage.input,
			outputTokens: usage.output,
			totalTokens: usage.total,
			inputLimit: modelLimits.inputLimit,
			threshold: DEFAULT_THRESHOLD,
			percentage: calculateUsagePercentage(usage.total, modelLimits.inputLimit),
		});
	};

	const responseParts: string[] = [];
	let finished = false;

	for (let step = 0; step < MAX_STEPS; step++) {
		const result = streamText({
			model: openai(MODEL_NAME),
			instructions: SYSTEM_PROMPT,
			messages,
			tools: modelTools,
			onError: () => {},
		});

		const toolCalls: ToolCallInfo[] = [];
		let currentText = "";
		let streamError: unknown;

		for await (const chunk of result.stream) {
			if (chunk.type === "text-delta") {
				currentText += chunk.text;
				callbacks.onToken(chunk.text);
			}
			if (chunk.type === "tool-call") {
				const input = chunk.input as Record<string, unknown>;
				if (!chunk.providerExecuted) {
					toolCalls.push({
						toolCallId: chunk.toolCallId,
						toolName: chunk.toolName,
						args: input,
					});
				}
				callbacks.onToolCallStart(chunk.toolName, input);
			}
			if (chunk.type === "tool-result" && chunk.providerExecuted) {
				callbacks.onToolCallEnd(
					chunk.toolName,
					summarizeProviderOutput(chunk.output),
				);
			}
			if (chunk.type === "error") {
				streamError = chunk.error;
			}
		}
		if (currentText) responseParts.push(currentText);

		if (streamError !== undefined) {
			const message =
				streamError instanceof Error
					? streamError.message
					: String(streamError);
			throw new Error(`Model request failed: ${message}`, {
				cause: streamError,
			});
		}

		const finishReason = await result.finishReason;
		const responseMessages = await result.responseMessages;
		messages.push(...responseMessages);
		reportTokenUsage();

		if (finishReason !== "tool-calls" || toolCalls.length === 0) {
			finished = true;
			break;
		}

		for (const tc of toolCalls) {
			const toolResult = await executeTool(tc.toolName, tc.args);
			callbacks.onToolCallEnd(tc.toolName, toolResult);

			messages.push({
				role: "tool",
				content: [
					{
						type: "tool-result",
						toolCallId: tc.toolCallId,
						toolName: tc.toolName,
						output: { type: "text", value: toolResult },
					},
				],
			});
		}
	}

	if (!finished) {
		const notice = `Stopped after ${MAX_STEPS} steps without a final answer. Ask me to continue if you want me to keep going.`;
		callbacks.onToken(notice);
		responseParts.push(notice);
		messages.push({ role: "assistant", content: notice });
	}

	const fullResponse = responseParts.join("\n\n");
	callbacks.onComplete(fullResponse);
	return messages;
}
