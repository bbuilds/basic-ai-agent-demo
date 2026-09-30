import assert from "node:assert/strict";
import { test } from "node:test";
import { formatFileSlice } from "./file.ts";

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
