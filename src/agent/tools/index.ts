import type { ToolSet } from "ai";
import { executeCode } from "./codeExecution.ts";
import { getDateTime } from "./dateTime.ts";
import {
	deleteFile,
	listFiles,
	readFile,
	searchFiles,
	writeFile,
} from "./file.ts";
import { runCommand } from "./shell.ts";
import { webSearch } from "./webSearch.ts";

export const tools = {
	getDateTime,
	deleteFile,
	listFiles,
	readFile,
	searchFiles,
	writeFile,
	webSearch,
	executeCode,
	runCommand,
};

/**
 * The same tools, minus their `execute` implementations. Making TS happy
 */
export const modelTools = Object.fromEntries(
	Object.entries(tools).map(([name, { execute, ...rest }]) => [name, rest]),
) as ToolSet;
