import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { tool } from "ai";
import { z } from "zod";
import { isSensitivePath } from "../approval.ts";

const ROOT = process.cwd();

class PathEscapeError extends Error {}

function resolveSafe(inputPath: string, root = ROOT): string {
	const resolved = path.resolve(root, inputPath);
	if (resolved !== root && !resolved.startsWith(root + path.sep)) {
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

const SKIPPED_DIRS = new Set(["node_modules", ".git", "dist", ".agent-tmp"]);
const MAX_LIST_ENTRIES = 500;
const DEFAULT_SEARCH_RESULTS = 100;
const MAX_SEARCH_RESULTS = 1000;
const MAX_MATCH_LINE_CHARS = 200;
const MAX_SEARCH_FILE_BYTES = 1024 * 1024;
const BINARY_SNIFF_BYTES = 8000;

interface WalkEntry {
	entry: Dirent;
	relativePath: string;
	absolutePath: string;
}

const byName = (a: Dirent, b: Dirent) =>
	a.name < b.name ? -1 : a.name > b.name ? 1 : 0;

async function* walk(
	dir: string,
	recursive: boolean,
	relativeDir = "",
): AsyncGenerator<WalkEntry> {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	entries.sort(byName);
	for (const entry of entries) {
		const relativePath = relativeDir
			? `${relativeDir}/${entry.name}`
			: entry.name;
		const absolutePath = path.join(dir, entry.name);
		yield { entry, relativePath, absolutePath };
		if (recursive && entry.isDirectory() && !SKIPPED_DIRS.has(entry.name)) {
			try {
				yield* walk(absolutePath, true, relativePath);
			} catch {}
		}
	}
}

export async function listDirectory(
	directory = ".",
	{
		recursive = false,
		maxEntries = MAX_LIST_ENTRIES,
		root = ROOT,
	}: { recursive?: boolean; maxEntries?: number; root?: string } = {},
): Promise<string> {
	try {
		const safeDir = resolveSafe(directory, root);
		const items: string[] = [];
		let truncated = false;
		for await (const { entry, relativePath } of walk(safeDir, recursive)) {
			if (items.length === maxEntries) {
				truncated = true;
				break;
			}
			items.push(`${entry.isDirectory() ? "[dir]" : "[file]"} ${relativePath}`);
		}
		if (items.length === 0) {
			return `Directory ${directory} is empty`;
		}
		if (truncated) {
			items.push(
				`[listing stopped at ${maxEntries} entries; list a subdirectory to see the rest]`,
			);
		}
		return items.join("\n");
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
}

export const listFiles = tool({
	description:
		"List the files and directories at a path. By default only the direct " +
		"children are listed; set recursive: true to list everything below it. " +
		"Recursive listings do not descend into node_modules, .git, dist, or " +
		`.agent-tmp. Returns at most ${MAX_LIST_ENTRIES} entries and ends with a ` +
		"note if the list was cut. To find text inside files, use searchFiles.",
	inputSchema: z.object({
		directory: z
			.string()
			.describe("The directory path to list contents of")
			.default("."),
		recursive: z
			.boolean()
			.optional()
			.describe(
				"List all nested files and directories too. Defaults to false.",
			),
	}),
	execute: async ({
		directory = ".",
		recursive = false,
	}: {
		directory?: string;
		recursive?: boolean;
	}) => listDirectory(directory, { recursive }),
});

interface SearchTarget {
	absolutePath: string;
	relativePath: string;
}

async function* searchTargets(
	searchRoot: string,
): AsyncGenerator<SearchTarget> {
	const stats = await fs.lstat(searchRoot);
	if (stats.isFile()) {
		yield {
			absolutePath: searchRoot,
			relativePath: path.basename(searchRoot),
		};
		return;
	}
	if (!stats.isDirectory()) {
		throw new Error("not a regular file or directory");
	}
	for await (const { entry, relativePath, absolutePath } of walk(
		searchRoot,
		true,
	)) {
		if (entry.isFile()) {
			yield { absolutePath, relativePath };
		}
	}
}

async function readSearchableText(filePath: string): Promise<string | null> {
	try {
		const stats = await fs.stat(filePath);
		if (stats.size > MAX_SEARCH_FILE_BYTES) {
			return null;
		}
		const buffer = await fs.readFile(filePath);
		if (buffer.subarray(0, BINARY_SNIFF_BYTES).includes(0)) {
			return null;
		}
		return buffer.toString("utf-8");
	} catch {
		return null;
	}
}

function clipLine(line: string): string {
	return line.length > MAX_MATCH_LINE_CHARS
		? `${line.slice(0, MAX_MATCH_LINE_CHARS)} ... [clipped]`
		: line;
}

function matchesGlob(relativePath: string, glob: string): boolean {
	const subject = glob.includes("/")
		? relativePath
		: path.posix.basename(relativePath);
	return path.matchesGlob(subject, glob);
}

export async function searchInFiles({
	pattern,
	path: searchPath = ".",
	glob,
	maxResults = DEFAULT_SEARCH_RESULTS,
	root = ROOT,
}: {
	pattern: string;
	path?: string;
	glob?: string;
	maxResults?: number;
	root?: string;
}): Promise<string> {
	let regex: RegExp;
	try {
		regex = new RegExp(pattern);
	} catch (error) {
		return `Error: Invalid regex pattern: ${(error as Error).message}`;
	}

	try {
		const safePath = resolveSafe(searchPath, root);
		const matches: string[] = [];
		let truncated = false;
		let sensitiveSkipped = 0;

		for await (const { absolutePath, relativePath } of searchTargets(
			safePath,
		)) {
			if (glob && !matchesGlob(relativePath, glob)) {
				continue;
			}
			const displayPath = path
				.relative(root, absolutePath)
				.split(path.sep)
				.join("/");
			if (isSensitivePath(displayPath)) {
				sensitiveSkipped++;
				continue;
			}
			const text = await readSearchableText(absolutePath);
			if (text === null) {
				continue;
			}
			const lines = text.split("\n");
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i].replace(/\r$/, "");
				if (!regex.test(line)) {
					continue;
				}
				if (matches.length === maxResults) {
					truncated = true;
					break;
				}
				matches.push(`${displayPath}:${i + 1}: ${clipLine(line)}`);
			}
			if (truncated) {
				break;
			}
		}

		const output =
			matches.length > 0
				? matches
				: [`No matches for ${pattern} in ${searchPath}`];
		if (truncated) {
			output.push(
				`[showing first ${maxResults} matches; narrow path or glob, or raise maxResults, to see more]`,
			);
		}
		if (sensitiveSkipped > 0) {
			output.push(
				`[${sensitiveSkipped} sensitive file${sensitiveSkipped === 1 ? "" : "s"} skipped; use readFile (requires approval)]`,
			);
		}
		return output.join("\n");
	} catch (error) {
		if (error instanceof PathEscapeError) {
			return `Error: ${error.message}`;
		}
		const err = error as NodeJS.ErrnoException;
		if (err.code === "ENOENT") {
			return `Error: Path not found: ${searchPath}`;
		}
		return `Error searching files: ${err.message}`;
	}
}

export const searchFiles = tool({
	description:
		"Search file contents for lines matching a JavaScript regular expression. " +
		"Returns one line per match as 'path:line: text', with paths relative to " +
		`the project root and lines longer than ${MAX_MATCH_LINE_CHARS} characters ` +
		"clipped. Skips node_modules, .git, dist, .agent-tmp, binary files, files " +
		"over 1 MB, and sensitive files such as .env. Ends with a note if results " +
		"were cut. To see which files exist, use listFiles.",
	inputSchema: z.object({
		pattern: z
			.string()
			.min(1)
			.describe(
				"JavaScript regular expression to match against each line, e.g. 'function \\w+Tool' or 'TODO'. Case-sensitive.",
			),
		path: z
			.string()
			.optional()
			.describe(
				"File or directory to search, relative to the project root. Defaults to '.'.",
			),
		glob: z
			.string()
			.optional()
			.describe(
				"Only search files matching this glob, e.g. '*.ts' or 'src/**/*.tsx'. A glob without '/' matches file names; one with '/' matches paths relative to path.",
			),
		maxResults: z
			.number()
			.int()
			.min(1)
			.max(MAX_SEARCH_RESULTS)
			.optional()
			.describe(
				`Maximum number of matching lines to return. Defaults to ${DEFAULT_SEARCH_RESULTS}.`,
			),
	}),
	execute: async (args: {
		pattern: string;
		path?: string;
		glob?: string;
		maxResults?: number;
	}) => searchInFiles(args),
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
