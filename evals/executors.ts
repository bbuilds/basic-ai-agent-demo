import { openai } from "@ai-sdk/openai";
import { generateText, stepCountIs, type ToolSet, tool } from "ai";
import { z } from "zod";
import type { EvalData, SingleTurnResult } from "./types.ts";
import { buildMessages } from "./utils.ts";

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

  const { toolCalls: rawToolCalls } = await generateText({
    model: openai(data.config?.model ?? "gpt-5.6-luna"),
    messages,
    tools,
    stopWhen: stepCountIs(1),
    temperature: data.config?.temperature ?? undefined,
  });

  const toolCalls = rawToolCalls.map((call) => ({
    toolName: call.toolName,
    args: "args" in call ? call.args : {},
  }));

  const toolNames = rawToolCalls.map((call) => call.toolName);
  return { toolCalls, toolNames, selectedAny: toolNames.length > 0 };
};
