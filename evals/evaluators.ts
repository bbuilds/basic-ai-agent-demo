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
      system: `You are an evaluation judge. Score the agent's response on a scale of 1-10.

${target.rubric ?? DEFAULT_RUBRIC}`,
      messages: [
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

/**
 * Shared accessors so the tool-usage evaluators below work against either
 * result/target shape (single-turn selection or full multi-turn agent runs).
 */
type AnyResult = SingleTurnResult | MultiTurnResult;
type AnyTarget = EvalTarget | MultiTurnTarget;

/** Unique tool names the model reached for. */
function selectedTools(output: AnyResult): Set<string> {
  return new Set("toolNames" in output ? output.toolNames : output.toolsUsed);
}

/** Tool names in call order. Single-turn calls are already ordered within the step. */
function callOrder(output: AnyResult): string[] {
  return "toolCallOrder" in output ? output.toolCallOrder : output.toolNames;
}

/** The unordered expectation, falling back to the ordered one when only that is given. */
function expectedSet(target: AnyTarget): string[] | undefined {
  if ("expectedTools" in target && target.expectedTools?.length) {
    return target.expectedTools;
  }
  return target.expectedToolOrder;
}

/**
 * Evaluator: Were all expected tools selected?
 * Returns 1 only if every expected tool appears in the output, 0 otherwise.
 * For golden prompts. Extra tools are not penalized here - use
 * `toolSelectionScore` for precision or `toolsAvoided` for hard exclusions.
 */
export function toolsSelected(output: AnyResult, target: AnyTarget): number {
  const expected = expectedSet(target);
  if (!expected?.length) return 1;

  const selected = selectedTools(output);
  return expected.every((t) => selected.has(t)) ? 1 : 0;
}

/**
 * Evaluator: Were forbidden tools avoided?
 * Returns 1 if NONE of the forbidden tools were called, 0 otherwise.
 * For negative prompts, and for golden prompts that must not take a
 * destructive action (e.g. a read request that must never call deleteFile).
 */
export function toolsAvoided(output: AnyResult, target?: AnyTarget): number {
  if (!target?.forbiddenTools?.length) return 1;

  const selected = selectedTools(output);
  return target.forbiddenTools.some((t) => selected.has(t)) ? 0 : 1;
}

/**
 * Evaluator: Were tools called in the expected order?
 * Returns the fraction of the expected sequence matched as a subsequence of the
 * actual calls - order matters, adjacency does not, so unrelated tool calls
 * interleaved between the expected ones are tolerated.
 *
 * Scores 1 when the target declares no `expectedToolOrder`, and 0 when an order
 * is expected but no tools were called at all.
 */
export function toolOrderCorrect(output: AnyResult, target?: AnyTarget): number {
  const expected = target?.expectedToolOrder;
  if (!expected?.length) return 1;

  const actual = callOrder(output);

  let expectedIdx = 0;
  for (const toolName of actual) {
    if (toolName === expected[expectedIdx]) {
      expectedIdx++;
      if (expectedIdx === expected.length) break;
    }
  }

  return expectedIdx / expected.length;
}
