import type { ToolSet } from "ai";
import { getDateTime } from "./dateTime.ts";

// All tools combined for the agent
export const tools = {
  getDateTime,
};

/**
 * The same tools, minus their `execute` implementations. Making TS happy
 */
export const modelTools = Object.fromEntries(
  Object.entries(tools).map(([name, { execute, ...rest }]) => [name, rest]),
) as ToolSet;
