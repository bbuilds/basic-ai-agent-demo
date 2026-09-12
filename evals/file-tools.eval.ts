import { evaluate } from "@lmnr-ai/lmnr";
import dataset from "./data/file-tools.json" with { type: "json" };
import { toolSelectionScore } from "./evaluators.ts";
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
 */

const executor = async (data: EvalData) => {
  return singleTurnExecutorWithMocks(data);
};

evaluate({
  data: dataset as Array<{ data: EvalData; target: EvalTarget }>,
  executor,
  evaluators: {
    // For secondary prompts: precision/recall score
    selectionScore: (output, target) => {
      if (target?.category !== "secondary") return 1; // Skip for non-secondary
      return toolSelectionScore(output, target);
    },
  },
  config: {
    projectApiKey: process.env.LMNR_API_KEY,
  },
  groupName: "file-tools-selection",
});
