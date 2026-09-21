import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { tool } from "ai";
import shell from "shelljs";
import { z } from "zod";
import { DEFAULT_TIMEOUT_MS, runProcess } from "./exec.ts";

const TMP_DIR = path.join(process.cwd(), ".agent-tmp");

const inputSchema = z.object({
	code: z.string().describe("The code to execute"),
	language: z
		.enum(["javascript", "python", "typescript"])
		.describe("The programming language of the code")
		.default("javascript"),
});

type Language = z.infer<typeof inputSchema>["language"];

const extensions: Record<Language, string> = {
	javascript: ".js",
	python: ".py",
	typescript: ".ts",
};

/**
 * Resolve the interpreter command for a language, or return an error string
 * when it isn't available. Never uses `npx`, which could block a turn on a
 * network install when the CLI runs outside this repo.
 */
function resolveCommand(language: Language, file: string): string | Error {
	const quoted = `"${file}"`;

	switch (language) {
		case "javascript":
			return `node ${quoted}`;
		case "python":
			if (!shell.which("python3")) {
				return new Error("python3 is not installed or not on PATH");
			}
			return `python3 ${quoted}`;
		case "typescript": {
			const tsx = shell.which("tsx");
			return tsx
				? `"${tsx}" ${quoted}`
				: `node --experimental-strip-types ${quoted}`;
		}
	}
}

export const executeCode = tool({
	description: `Execute code for anything you need compute for. Supports JavaScript (Node.js), Python, and TypeScript. Runs in the project directory, non-interactively (no stdin), is killed after ${DEFAULT_TIMEOUT_MS / 1000}s, and long output is truncated. Print results to stdout to see them.`,
	inputSchema,
	execute: async ({ code, language }: { code: string; language: Language }) => {
		const tmpFile = path.join(
			TMP_DIR,
			`code-exec-${randomUUID()}${extensions[language]}`,
		);

		const command = resolveCommand(language, tmpFile);
		if (command instanceof Error) {
			return `Error: ${command.message}`;
		}

		try {
			await fs.mkdir(TMP_DIR, { recursive: true });
			await fs.writeFile(tmpFile, code, "utf-8");

			return await runProcess(command);
		} catch (error) {
			const err = error as Error;
			return `Error executing code: ${err.message}`;
		} finally {
			// Clean up temp file
			try {
				await fs.unlink(tmpFile);
			} catch {
				// Ignore cleanup errors
			}
		}
	},
});
