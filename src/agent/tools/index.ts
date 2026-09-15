import type { ToolSet } from "ai";
import { getDateTime } from "./dateTime.ts";
import { deleteFile, listFiles, readFile, writeFile } from "./file.ts";

// All tools combined for the agent
export const tools = {
  getDateTime,
  deleteFile,
  listFiles,
  readFile,
  writeFile,
};

/**
 * The same tools, minus their `execute` implementations. Making TS happy
 */
export const modelTools = Object.fromEntries(
  Object.entries(tools).map(([name, { execute, ...rest }]) => [name, rest]),
) as ToolSet;
