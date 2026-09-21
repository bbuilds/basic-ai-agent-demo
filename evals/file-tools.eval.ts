import { evaluate } from "@lmnr-ai/lmnr";
import dataset from "./data/file-tools.json" with { type: "json" };
import {
	toolOrderCorrect,
	toolSelectionScore,
	toolsAvoided,
	toolsSelected,
} from "./evaluators.ts";
import { singleTurnExecutorWithMocks } from "./executors.ts";
import type { EvalData, EvalTarget } from "./types.ts";

/**
 * File Tools Selection Evaluation
 *
 * Tests whether the LLM correctly selects file-related tools
 * (readFile, writeFile, listFiles, deleteFile) based on user prompts.
 *
 * Categories:
 * - golden: Must select specific expected tools
 * - secondary: Likely selects certain tools, scored on precision/recall
 * - negative: Must NOT select any file tools
 *
 * Evaluators:
 * - selectedExpected: Did golden prompts select every expected tool?
 * - selectionScore: Precision/recall for ambiguous (secondary) prompts
 * - toolOrderCorrect: Were the calls made in the expected sequence?
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
		toolOrderCorrect,
		toolsAvoided,
	},
	config: {
		projectApiKey: process.env.LMNR_API_KEY,
	},
	groupName: "file-tools-selection",
});
