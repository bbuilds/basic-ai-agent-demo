import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { Laminar, LaminarAiSdkTelemetry } from "@lmnr-ai/lmnr";
import { generateText, type ModelMessage, registerTelemetry } from "ai";
import type { AgentCallbacks } from "../types.ts";
import { SYSTEM_PROMPT } from "./system/prompt.ts";

import { tools } from "./tools/index.ts";

const MODEL_NAME = "gpt-5.6-luna";

registerTelemetry(new LaminarAiSdkTelemetry());

export async function runAgent(
	userMessage: string,
	_conversationHistory: ModelMessage[],
	_callbacks: AgentCallbacks,
	// biome-ignore lint/suspicious/noExplicitAny: @TODO remove after testing
): Promise<any> {
	const { text, toolCalls } = await generateText({
		model: openai(MODEL_NAME),
		prompt: userMessage,
		system: SYSTEM_PROMPT,
		tools,
	});

	console.log("testing");
}

await runAgent("What time is it on Mars?");

// Short-lived script: flush pending spans before the process exits.
await Laminar.shutdown();
