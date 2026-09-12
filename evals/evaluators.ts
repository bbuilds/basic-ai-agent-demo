import { openai } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { z } from "zod";
import type {
  EvalTarget,
  MultiTurnResult,
  MultiTurnTarget,
  SingleTurnResult,
} from "./types";

const judgeSchema = z.object({
  score: z
    .number()
    .min(1)
    .max(10)
    .describe("Score from 1-10 where 10 is perfect"),
  reason: z.string().describe("Succinct reason for the score"),
});

const DEFAULT_RUBRIC = `Scoring criteria:
- 10: Response fully addresses the task using tool results correctly
- 7-9: Response is mostly correct with minor issues
- 4-6: Response partially addresses the task
- 1-3: Response is mostly incorrect or irrelevant`;

/**
 * Evaluator: LLM-as-judge for output quality.
 * Uses structured output to reliably assess if the agent's response is correct.
 * Returns a score from 0-1 (internally uses 1-10 scale divided by 10).
 */
export async function llmJudge(
  output: MultiTurnResult,
  target: MultiTurnTarget,
): Promise<number> {
  const toolActivity = output.steps.flatMap((step) => {
    const calls = step.toolCalls ?? [];
    const results = step.toolResults ?? [];
    return calls.map((call) => ({
      toolName: call.toolName,
      args: call.args,
      result: results.find((r) => r.toolName === call.toolName)?.result,
    }));
  });

  try {
    const result = await generateText({
      model: openai(process.env.JUDGE_MODEL ?? "gpt-5.6-terra"),
      output: Output.object({
        schema: judgeSchema,
        name: "evaluation",
        description: "Evaluation of an AI agent response",
      }),
      providerOptions: {
        openai: {
          reasoningEffort: "high",
        },
      },
      messages: [
        {
          role: "system",
          content: `You are an evaluation judge. Score the agent's response on a scale of 1-10.

${target.rubric ?? DEFAULT_RUBRIC}`,
        },
        {
          role: "user",
          content: `Task: ${target.originalTask}

Tool calls and results (in order): ${JSON.stringify(toolActivity)}

Agent's final response:
${output.text}

Evaluate if this response correctly uses the tool results to answer the task.`,
        },
      ],
    });
    return result.output.score / 10;
  } catch (err) {
    throw new Error(
      `llmJudge failed for task "${target.originalTask}": ${
        err instanceof Error ? err.message : String(err)
      }`,
      { cause: err },
    );
  }
}

/**
 * Evaluator: Precision/recall score for tool selection.
 * Returns a score between 0 and 1 based on correct selections.
 * For secondary prompts.
 */
export function toolSelectionScore(
  output: SingleTurnResult,
  target: EvalTarget,
): number {
  if (!target.expectedTools?.length) {
    return output.selectedAny ? 0.5 : 1;
  }

  const expected = new Set(target.expectedTools);
  const selected = new Set(output.toolNames);

  const hits = output.toolNames.filter((t) => expected.has(t)).length;
  const precision = selected.size > 0 ? hits / selected.size : 0;
  const recall = expected.size > 0 ? hits / expected.size : 0;

  // Simple F1-ish score
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}
