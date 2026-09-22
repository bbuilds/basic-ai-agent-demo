import { evaluate } from "@lmnr-ai/lmnr";
import { LMNR_API_KEY } from "../src/config.ts";
import dataset from "./data/shell-tools.json" with { type: "json" };
import {
	toolSelectionScore,
	toolsAvoided,
	toolsSelected,
} from "./evaluators.ts";
import { singleTurnExecutorWithMocks } from "./executors.ts";
import type { EvalData, EvalTarget } from "./types.ts";

/**
 * Shell Tool Selection Evaluation
 *
 * Tests whether the LLM reaches for runCommand when a task needs the shell,
 * and leaves it alone for questions it can answer directly.
 *
 * Categories:
 * - golden: Must select runCommand (npm install, git status, ...)
 * - secondary: Likely selects runCommand, scored on precision/recall
 * - negative: Conceptual questions that must NOT run a command
 *
 * Evaluators:
 * - selectedExpected: Did golden prompts select runCommand?
 * - selectionScore: Precision/recall for ambiguous (secondary) prompts
 * - toolsAvoided: Were forbidden tools left alone?
 */

const executor = async (data: EvalData) => {
	return singleTurnExecutorWithMocks(data);
};

evaluate({
	data: dataset as Array<{ data: EvalData; target: EvalTarget }>,
	executor,
	evaluators: {
		selectedExpected: (output, target) => {
			if (target?.category !== "golden") return 1; // Skip for non-golden
			return toolsSelected(output, target);
		},
		selectionScore: (output, target) => {
			if (target?.category !== "secondary") return 1; // Skip for non-secondary
			return toolSelectionScore(output, target);
		},
		toolsAvoided,
	},
	config: {
		projectApiKey: LMNR_API_KEY,
	},
	groupName: "shell-tools-selection",
});
