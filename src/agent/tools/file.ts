import fs from "node:fs/promises";
import path from "node:path";
import { tool } from "ai";
import { z } from "zod";

const ROOT = process.cwd();

class PathEscapeError extends Error {}

function resolveSafe(inputPath: string): string {
	const resolved = path.resolve(ROOT, inputPath);
	if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) {
		throw new PathEscapeError(`Path escapes allowed directory: ${inputPath}`);
	}
	return resolved;
}

const MAX_READ_LINES = 2000;
const MAX_READ_CHARS = 40_000;
const LINE_NUMBER_WIDTH = 6;

export function formatFileSlice(
	content: string,
	startLine = 1,
	maxLines = MAX_READ_LINES,
	maxChars = MAX_READ_CHARS,
): string {
	const lines = content.split("\n");
	if (lines.at(-1) === "") {
		lines.pop();
	}
	const totalLines = lines.length;

	if (totalLines === 0) {
		return "File is empty";
	}
	if (startLine > totalLines) {
		return `Error: startLine ${startLine} is past the end of the file (${totalLines} lines)`;
	}

	const output: string[] = [];
	let usedChars = 0;
	let endLine = startLine - 1;

	while (endLine < totalLines && output.length < maxLines) {
		const lineNumber = endLine + 1;
		let line = `${String(lineNumber).padStart(LINE_NUMBER_WIDTH)}\t${lines[endLine]}`;
		if (usedChars + line.length + 1 > maxChars) {
			if (output.length > 0) {
				break;
			}
			line = `${line.slice(0, maxChars)} ... [line ${lineNumber} truncated]`;
		}
		output.push(line);
		usedChars += line.length + 1;
		endLine = lineNumber;
	}

	if (endLine < totalLines) {
		output.push(
			`[lines ${startLine}-${endLine} of ${totalLines} shown; call readFile with startLine=${endLine + 1} to continue]`,
		);
	}
	return output.join("\n");
}

export const readFile = tool({
	description:
		"Read a text file at the specified path. Each line is prefixed with its " +
		"1-based line number and a tab, e.g. '    12\\tconst x = 1;'. The prefix " +
		`is not part of the file. Returns at most ${MAX_READ_LINES} lines or about ` +
		`${MAX_READ_CHARS} characters per call; if more remain, the output ends ` +
		"with a note giving the startLine to pass on the next call.",
	inputSchema: z.object({
		path: z.string().describe("The path to the file to read"),
		startLine: z
			.number()
			.int()
			.min(1)
			.optional()
			.describe(
				"1-based line number to start reading from. Defaults to 1, the first line.",
			),
		maxLines: z
			.number()
			.int()
			.min(1)
			.optional()
			.describe(
				`Maximum number of lines to return. Defaults to ${MAX_READ_LINES}.`,
			),
	}),
	execute: async ({
		path: filePath,
		startLine = 1,
		maxLines = MAX_READ_LINES,
	}: {
		path: string;
		startLine?: number;
		maxLines?: number;
	}) => {
		try {
			const safePath = resolveSafe(filePath);
			const content = await fs.readFile(safePath, "utf-8");
			return formatFileSlice(content, startLine, maxLines);
		} catch (error) {
			if (error instanceof PathEscapeError) {
				return `Error: ${error.message}`;
			}
			const err = error as NodeJS.ErrnoException;
			if (err.code === "ENOENT") {
				return `Error: File not found: ${filePath}`;
			}
			return `Error reading file: ${err.message}`;
		}
	},
});

export const writeFile = tool({
	description:
		"Write content to a file at the specified path. Creates the file if it doesn't exist, overwrites if it does. " +
		"The content must be the raw file text: do not include the line-number prefixes that readFile adds.",
	inputSchema: z.object({
		path: z.string().describe("The path to the file to write"),
		content: z.string().describe("The content to write to the file"),
	}),
	execute: async ({
		path: filePath,
		content,
	}: {
		path: string;
		content: string;
	}) => {
		try {
			const safePath = resolveSafe(filePath);
			const dir = path.dirname(safePath);
			await fs.mkdir(dir, { recursive: true });

			await fs.writeFile(safePath, content, "utf-8");
			return `Successfully wrote ${content.length} characters to ${filePath}`;
		} catch (error) {
			if (error instanceof PathEscapeError) {
				return `Error: ${error.message}`;
			}
			const err = error as NodeJS.ErrnoException;
			return `Error writing file: ${err.message}`;
		}
	},
});

export const listFiles = tool({
	description:
		"List all files and directories in the specified directory path.",
	inputSchema: z.object({
		directory: z
			.string()
			.describe("The directory path to list contents of")
			.default("."),
	}),
	execute: async ({ directory }: { directory: string }) => {
		try {
			const safeDir = resolveSafe(directory);
			const entries = await fs.readdir(safeDir, { withFileTypes: true });
			const items = entries.map((entry) => {
				const type = entry.isDirectory() ? "[dir]" : "[file]";
				return `${type} ${entry.name}`;
			});
			return items.length > 0
				? items.join("\n")
				: `Directory ${directory} is empty`;
		} catch (error) {
			if (error instanceof PathEscapeError) {
				return `Error: ${error.message}`;
			}
			const err = error as NodeJS.ErrnoException;
			if (err.code === "ENOENT") {
				return `Error: Directory not found: ${directory}`;
			}
			return `Error listing directory: ${err.message}`;
		}
	},
});

export const deleteFile = tool({
	description:
		"Delete a file at the specified path. This is irreversible, so you must " +
		"pass confirm: true to actually perform the deletion. Omitting it or " +
		"passing false will not delete anything.",
	inputSchema: z.object({
		path: z.string().describe("The path to the file to delete"),
		confirm: z
			.boolean()
			.describe(
				"Must be explicitly set to true to perform the deletion. Acts as a safety check against accidental irreversible deletes.",
			),
	}),
	execute: async ({
		path: filePath,
		confirm,
	}: {
		path: string;
		confirm: boolean;
	}) => {
		if (!confirm) {
			return `Deletion of ${filePath} was not performed: confirm must be set to true.`;
		}
		try {
			const safePath = resolveSafe(filePath);
			await fs.unlink(safePath);
			return `Successfully deleted ${filePath}`;
		} catch (error) {
			if (error instanceof PathEscapeError) {
				return `Error: ${error.message}`;
			}
			const err = error as NodeJS.ErrnoException;
			if (err.code === "ENOENT") {
				return `Error: File not found: ${filePath}`;
			}
			return `Error deleting file: ${err.message}`;
		}
	},
});
