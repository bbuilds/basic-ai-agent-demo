import type { ModelMessage, ToolSet } from "ai";
import { modelTools } from "../src/agent/tools/index.ts";
import type { EvalData, MultiTurnEvalData } from "./types.ts";

/**
 * Pick the production tool definitions (description + input schema, no
 * execute) by name, so evals always test the interface the agent ships.
 */
export const pickTools = (names: string[]): ToolSet => {
	const picked: ToolSet = {};
	for (const name of names) {
		const def = modelTools[name];
		if (!def) {
			throw new Error(
				`Unknown tool "${name}" in eval data. Available: ${Object.keys(modelTools).join(", ")}`,
			);
		}
		picked[name] = def;
	}
	return picked;
};

/**
 * Build message array from eval data
 */
export const buildMessages = (data: EvalData): ModelMessage[] => [
	{ role: "user", content: data.prompt },
];

/**
 * Build mocked tools from data config: the real tool definitions, with
 * execute replaced to return the configured mockReturn value.
 */
export const buildMockedTools = (
	mockTools: MultiTurnEvalData["mockTools"],
): ToolSet => {
	const real = pickTools(Object.keys(mockTools));
	const tools: ToolSet = {};

	for (const [name, config] of Object.entries(mockTools)) {
		tools[name] = { ...real[name], execute: async () => config.mockReturn };
	}

	return tools;
};
