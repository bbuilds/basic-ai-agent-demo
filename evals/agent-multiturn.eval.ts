import { evaluate } from "@lmnr-ai/lmnr";
import { LMNR_API_KEY } from "../src/config.ts";
import dataset from "./data/agent-multiturn.json" with { type: "json" };
import { llmJudge, toolOrderCorrect, toolsAvoided } from "./evaluators.ts";
import { multiTurnWithMocks } from "./executors.ts";
import type {
	MultiTurnEvalData,
	MultiTurnResult,
	MultiTurnTarget,
} from "./types.ts";

/**
 * Multi-Turn Agent Evaluation
 *
 * Tests full agent behavior with mocked tools:
 * 1. Fresh task: User's first message, check tools + order + LLM judge
 * 2. Mid-conversation: Pre-filled messages, check continuation behavior
 * 3. Negative: Ensure wrong tool category not used (file vs shell)
 *
 * All tools are mocked to return fixed values for deterministic testing.
 *
 * Evaluators:
 * - toolOrderCorrect: Did tools get called in expected sequence?
 * - toolsAvoided: Were forbidden tools not called?
 * - llmJudge: Does the final response make sense given the task and results?
 */

const executor = async (data: MultiTurnEvalData): Promise<MultiTurnResult> => {
	return multiTurnWithMocks(data);
};

// Run the evaluation
evaluate({
	data: dataset as unknown as Array<{
		data: MultiTurnEvalData;
		target: MultiTurnTarget;
	}>,
	executor,
	evaluators: {
		toolOrderCorrect,
		toolsAvoided,
		outputQuality: async (output, target) => {
			if (!target) return 1;
			return llmJudge(output, target);
		},
	},
	config: {
		projectApiKey: LMNR_API_KEY,
	},
	groupName: "agent-multiturn",
});
