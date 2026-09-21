import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { executeTool } from "../executeTool.ts";

const TMP_DIR = path.join(process.cwd(), ".agent-tmp");

test("executeCode runs javascript", async () => {
  const result = await executeTool("executeCode", {
    code: "console.log(6 * 7)",
    language: "javascript",
  });
  assert.equal(result.trim(), "42");
});

test("executeCode runs typescript without npx", async () => {
  const result = await executeTool("executeCode", {
    code: "const n: number = 6 * 7;\nconsole.log(n);",
    language: "typescript",
  });
  assert.equal(result.trim(), "42");
});

test("executeCode runs in the project directory", async () => {
  const result = await executeTool("executeCode", {
    code: "console.log(process.cwd())",
    language: "javascript",
  });
  assert.equal(result.trim(), process.cwd());
});

test("executeCode reports a failing script with its error", async () => {
  const result = await executeTool("executeCode", {
    code: "throw new Error('boom')",
    language: "javascript",
  });
  assert.match(result, /Command failed/);
  assert.match(result, /boom/);
});

test("executeCode cleans up its temp file", async () => {
  await executeTool("executeCode", { code: "1", language: "javascript" });
  const leftovers = await fs.readdir(TMP_DIR).catch(() => []);
  assert.deepEqual(leftovers, []);
});

test("runCommand refuses a denylisted command", async () => {
  const result = await executeTool("runCommand", { command: "rm -rf /" });
  assert.match(result, /^Error: refusing to run command/);
});
