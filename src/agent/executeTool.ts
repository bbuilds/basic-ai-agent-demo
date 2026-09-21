import { truncateOutput } from "./tools/exec.ts";
import { tools } from "./tools/index.ts";

const MAX_TOOL_RESULT_CHARS = 50_000;

export type ToolName = keyof typeof tools;

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const tool = tools[name as ToolName];

  if (!tool) {
    return `Unknown tool: ${name}`;
  }

  const execute = tool.execute;
  if (!execute) {
    // Provider tools (like webSearch) are executed by OpenAI, not us
    return `Provider tool ${name} - executed by model provider`;
  }
  try {
    const result = await execute(
      args as any,
      {
        toolCallId: "",
        messages: [],
        context: undefined,
        // biome-ignore lint/suspicious/noExplicitAny: `context` is only required for tools with a contextSchema
      } as any,
    );

    return truncateOutput(String(result), MAX_TOOL_RESULT_CHARS);
  } catch (error) {
    const err = error as Error;
    return `Error executing tool ${name}: ${err.message}`;
  }
}
