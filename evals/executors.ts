import { openai } from "@ai-sdk/openai";
import {
  generateText,
  type ModelMessage,
  stepCountIs,
  type ToolSet,
  tool,
} from "ai";
import { z } from "zod";
import { SYSTEM_PROMPT } from "../src/agent/system/prompt.ts";
import type {
  EvalData,
  MultiTurnEvalData,
  MultiTurnResult,
  SingleTurnResult,
} from "./types.ts";
import { buildMessages, buildMockedTools } from "./utils.ts";

/**
 * Tool definitions for mocked single-turn evaluations.
 * These define the schema the LLM sees without real implementations.
 */
const TOOL_DEFINITIONS: Record<
  string,
  { description: string; parameters: z.ZodObject<z.ZodRawShape> }
> = {
  readFile: {
    description: "Read the contents of a file at the specified path",
    parameters: z.object({
      path: z.string().describe("The path to the file to read"),
    }),
  },
  writeFile: {
    description: "Write content to a file at the specified path",
    parameters: z.object({
      path: z.string().describe("The path to the file to write"),
      content: z.string().describe("The content to write to the file"),
    }),
  },
  listFiles: {
    description: "List all files in a directory",
    parameters: z.object({
      path: z.string().describe("The directory path to list files from"),
    }),
  },
  deleteFile: {
    description: "Delete a file at the specified path",
    parameters: z.object({
      path: z.string().describe("The path to the file to delete"),
    }),
  },
  runCommand: {
    description: "Execute a shell command and return its output",
    parameters: z.object({
      command: z.string().describe("The shell command to execute"),
    }),
  },
};

// A minimal single-turn chat
export const singleTurnExecutorWithMocks = async (
  data: EvalData,
): Promise<SingleTurnResult> => {
  const messages = buildMessages(data);
  const tools: ToolSet = {};
  for (const toolName of data.tools) {
    const def = TOOL_DEFINITIONS[toolName];
    if (def) {
      tools[toolName] = tool({
        description: def.description,
        inputSchema: def.parameters,
      });
    }
  }

  try {
    const { toolCalls: rawToolCalls } = await generateText({
      model: openai(
        data.config?.model ?? process.env.AGENT_MODEL ?? "gpt-5.6-luna",
      ),
      messages,
      tools,
      stopWhen: stepCountIs(1),
      temperature: data.config?.temperature ?? undefined,
      allowSystemInMessages: true,
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

  const messages: ModelMessage[] = data.messages
    ? [{ role: "system", content: SYSTEM_PROMPT }, ...data.messages]
    : [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: data.prompt! },
      ];

  try {
    const result = await generateText({
      model: openai(
        data.config?.model ?? process.env.AGENT_MODEL ?? "gpt-5.6-luna",
      ),
      messages,
      tools,
      stopWhen: stepCountIs(data.config?.maxSteps ?? 20),
      temperature: data.config?.temperature ?? undefined,
    });

    // Extract all tool calls in order from steps
    const allToolCalls: string[] = [];
    const steps = result.steps.map((step) => {
      const stepToolCalls = (step.toolCalls ?? []).map((tc) => {
        allToolCalls.push(tc.toolName);
        return {
          toolName: tc.toolName,
          args: tc.input,
        };
      });

      const stepToolResults = (step.toolResults ?? []).map((tr) => ({
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
