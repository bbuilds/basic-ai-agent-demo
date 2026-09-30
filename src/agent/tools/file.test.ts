import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { formatFileSlice, listDirectory, searchInFiles } from "./file.ts";

const numbered = (count: number) =>
	Array.from({ length: count }, (_, i) => `line ${i + 1}`).join("\n");

test("formatFileSlice prefixes each line with its number", () => {
	assert.equal(formatFileSlice("a\nb\n"), "     1\ta\n     2\tb");
});

test("formatFileSlice returns a short file with no continuation note", () => {
	assert.ok(!formatFileSlice(numbered(10)).includes("startLine="));
});

test("formatFileSlice caps lines and says where to continue", () => {
	const output = formatFileSlice(numbered(5400));
	const lines = output.split("\n");

	assert.equal(lines.length, 2001);
	assert.equal(lines[1999], "  2000\tline 2000");
	assert.equal(
		lines[2000],
		"[lines 1-2000 of 5400 shown; call readFile with startLine=2001 to continue]",
	);
});

test("formatFileSlice starts at startLine and honours maxLines", () => {
	const output = formatFileSlice(numbered(100), 50, 3);

	assert.equal(
		output,
		"    50\tline 50\n    51\tline 51\n    52\tline 52\n" +
			"[lines 50-52 of 100 shown; call readFile with startLine=53 to continue]",
	);
});

test("formatFileSlice cuts on a line boundary when the char cap is hit", () => {
	const content = Array.from({ length: 10 }, () => "x".repeat(100)).join("\n");
	const output = formatFileSlice(content, 1, 2000, 350);

	assert.ok(output.endsWith("startLine=4 to continue]"));
	assert.ok(
		output
			.split("\n")
			.slice(0, 3)
			.every((line) => line.endsWith("x")),
	);
});

test("formatFileSlice truncates a single line longer than the char cap", () => {
	const content = `${"x".repeat(1000)}\nshort`;
	const output = formatFileSlice(content, 1, 2000, 200);

	assert.ok(output.includes("[line 1 truncated]"));
	assert.ok(output.endsWith("call readFile with startLine=2 to continue]"));
});

test("formatFileSlice reports a startLine past the end", () => {
	assert.equal(
		formatFileSlice(numbered(10), 11),
		"Error: startLine 11 is past the end of the file (10 lines)",
	);
});

test("formatFileSlice handles an empty file", () => {
	assert.equal(formatFileSlice(""), "File is empty");
});

async function makeFixture(files: Record<string, string | Buffer>) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "file-tools-"));
	for (const [relativePath, content] of Object.entries(files)) {
		const filePath = path.join(root, relativePath);
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.writeFile(filePath, content);
	}
	return root;
}

const projectFixture = () =>
	makeFixture({
		"README.md": "# demo\nTODO: write docs\n",
		"src/index.ts": "import { run } from './run';\n// TODO: wire up\nrun();\n",
		"src/run.tsx": "export function run() {\n\treturn 'TODO';\n}\n",
		"node_modules/pkg/index.js": "// TODO in dependency\n",
		".git/HEAD": "TODO\n",
		"dist/index.js": "// TODO built\n",
		".agent-tmp/scratch.js": "// TODO scratch\n",
		".env": "API_KEY=TODO\n",
		"config/secrets.json": '{"token": "TODO"}\n',
	});

test("listDirectory lists direct children by default", async () => {
	const root = await projectFixture();

	assert.equal(
		await listDirectory(".", { root }),
		[
			"[dir] .agent-tmp",
			"[file] .env",
			"[dir] .git",
			"[file] README.md",
			"[dir] config",
			"[dir] dist",
			"[dir] node_modules",
			"[dir] src",
		].join("\n"),
	);
});

test("listDirectory recurses without entering skipped directories", async () => {
	const root = await projectFixture();
	const output = await listDirectory(".", { root, recursive: true });

	assert.ok(output.includes("[file] src/index.ts"));
	assert.ok(output.includes("[file] config/secrets.json"));
	assert.ok(output.includes("[dir] node_modules"));
	for (const hidden of [
		"node_modules/pkg",
		".git/HEAD",
		"dist/index.js",
		".agent-tmp/scratch.js",
	]) {
		assert.ok(!output.includes(hidden), hidden);
	}
});

test("listDirectory caps entries and says the list was cut", async () => {
	const root = await makeFixture(
		Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`f${i}.txt`, ""])),
	);
	const lines = (await listDirectory(".", { root, maxEntries: 3 })).split("\n");

	assert.deepEqual(lines, [
		"[file] f0.txt",
		"[file] f1.txt",
		"[file] f2.txt",
		"[listing stopped at 3 entries; list a subdirectory to see the rest]",
	]);
});

test("listDirectory reports empty, missing, and escaping directories", async () => {
	const root = await makeFixture({ "empty/.keep": "" });
	await fs.rm(path.join(root, "empty/.keep"));

	assert.equal(
		await listDirectory("empty", { root }),
		"Directory empty is empty",
	);
	assert.equal(
		await listDirectory("nope", { root }),
		"Error: Directory not found: nope",
	);
	assert.ok(
		(await listDirectory("..", { root })).startsWith("Error: Path escapes"),
	);
});

test("searchInFiles returns path:line: text and skips excluded files", async () => {
	const root = await projectFixture();

	assert.equal(
		await searchInFiles({ pattern: "TODO", root }),
		[
			"README.md:2: TODO: write docs",
			"src/index.ts:2: // TODO: wire up",
			"src/run.tsx:2: \treturn 'TODO';",
			"[2 sensitive files skipped; use readFile (requires approval)]",
		].join("\n"),
	);
});

test("searchInFiles filters by path and glob", async () => {
	const root = await projectFixture();

	assert.equal(
		await searchInFiles({ pattern: "TODO", path: "src", glob: "*.ts", root }),
		"src/index.ts:2: // TODO: wire up",
	);
	assert.equal(
		await searchInFiles({ pattern: "TODO", glob: "src/*.tsx", root }),
		"src/run.tsx:2: \treturn 'TODO';",
	);
	assert.equal(
		await searchInFiles({ pattern: "run", path: "src/run.tsx", root }),
		"src/run.tsx:1: export function run() {",
	);
});

test("searchInFiles will not read a sensitive file named directly", async () => {
	const root = await projectFixture();

	assert.equal(
		await searchInFiles({ pattern: "API_KEY", path: ".env", root }),
		"No matches for API_KEY in .env\n" +
			"[1 sensitive file skipped; use readFile (requires approval)]",
	);
});

test("searchInFiles skips binary and very large files", async () => {
	const root = await makeFixture({
		"bin.dat": Buffer.from([0x6e, 0x65, 0x65, 0x64, 0x6c, 0x65, 0x00, 0x01]),
		"big.txt": `needle\n${"x".repeat(2 * 1024 * 1024)}`,
		"ok.txt": "needle\n",
	});

	assert.equal(
		await searchInFiles({ pattern: "needle", root }),
		"ok.txt:1: needle",
	);
});

test("searchInFiles clips long lines", async () => {
	const root = await makeFixture({ "long.txt": `needle${"y".repeat(500)}` });
	const output = await searchInFiles({ pattern: "needle", root });

	assert.ok(output.endsWith(" ... [clipped]"));
	assert.ok(output.length < 250);
});

test("searchInFiles caps results and says they were cut", async () => {
	const root = await makeFixture({
		"many.txt": Array.from({ length: 10 }, (_, i) => `hit ${i}`).join("\n"),
	});

	assert.equal(
		await searchInFiles({ pattern: "hit", maxResults: 2, root }),
		"many.txt:1: hit 0\nmany.txt:2: hit 1\n" +
			"[showing first 2 matches; narrow path or glob, or raise maxResults, to see more]",
	);
});

test("searchInFiles reports bad patterns and bad paths", async () => {
	const root = await projectFixture();

	assert.ok(
		(await searchInFiles({ pattern: "(", root })).startsWith(
			"Error: Invalid regex pattern",
		),
	);
	assert.equal(
		await searchInFiles({ pattern: "x", path: "nope", root }),
		"Error: Path not found: nope",
	);
	assert.ok(
		(await searchInFiles({ pattern: "x", path: "..", root })).startsWith(
			"Error: Path escapes",
		),
	);
});

test("searchInFiles does not follow symlinks out of the project", async () => {
	const outside = await makeFixture({ "leak.txt": "needle\n" });
	const root = await makeFixture({ "ok.txt": "needle\n" });
	await fs.symlink(outside, path.join(root, "linked-dir"));
	await fs.symlink(path.join(outside, "leak.txt"), path.join(root, "leak.txt"));

	assert.equal(
		await searchInFiles({ pattern: "needle", root }),
		"ok.txt:1: needle",
	);
	assert.ok(
		(
			await searchInFiles({ pattern: "needle", path: "linked-dir", root })
		).startsWith("Error searching files"),
	);
});
