import assert from "node:assert/strict";
import { test } from "node:test";
import { REDACTED, runProcess, truncateOutput } from "./exec.ts";

test("truncateOutput leaves short output untouched", () => {
	assert.equal(truncateOutput("hello", 100), "hello");
});

test("truncateOutput keeps both head and tail", () => {
	const output = `${"A".repeat(500)}${"B".repeat(500)}`;
	const truncated = truncateOutput(output, 100);

	assert.ok(truncated.startsWith("A"), "head is preserved");
	assert.ok(truncated.endsWith("B"), "tail is preserved");
	assert.ok(
		truncated.includes("[truncated 900 characters]"),
		"marker states how much was dropped",
	);
});

test("truncateOutput preserves the trailing error, where stack traces live", () => {
	const output = `${"noise\n".repeat(5000)}Error: the actual problem`;
	const truncated = truncateOutput(output, 200);

	assert.ok(truncated.includes("Error: the actual problem"));
});

test("runProcess returns stdout", async () => {
	const result = await runProcess("echo hi");
	assert.equal(result.trim(), "hi");
});

test("runProcess reports a nonzero exit code", async () => {
	const result = await runProcess("exit 3");
	assert.match(result, /exit code 3/);
});

test("runProcess labels stderr separately from stdout", async () => {
	const result = await runProcess("echo OUT; echo ERR 1>&2");

	assert.match(result, /OUT/);
	assert.match(result, /--- stderr ---/);
	assert.match(result, /ERR/);
});

test("runProcess describes an empty successful command", async () => {
	const result = await runProcess("true");
	assert.equal(result, "Command completed successfully (no output)");
});

test("runProcess kills a command that exceeds its timeout", async () => {
	const startedAt = Date.now();
	const result = await runProcess("sleep 5", { timeoutMs: 300 });
	const elapsed = Date.now() - startedAt;

	assert.match(result, /timed out after 0\.3s/);
	assert.ok(elapsed < 4000, `returned in ${elapsed}ms, well before the sleep`);
});

test("runProcess does not block the event loop", async () => {
	let ticks = 0;
	const interval = setInterval(() => ticks++, 10);

	try {
		await runProcess("sleep 1");
	} finally {
		clearInterval(interval);
	}

	// The synchronous shelljs form yields exactly 0 ticks here.
	assert.ok(ticks > 50, `event loop ran during the command (${ticks} ticks)`);
});

test("runProcess masks agent credentials from the child environment", async () => {
	const sentinel = "sk-test-sentinel-value";
	const original = process.env.OPENAI_API_KEY;
	process.env.OPENAI_API_KEY = sentinel;

	try {
		const result = await runProcess("echo $OPENAI_API_KEY");

		assert.ok(!result.includes(sentinel), "real key never reaches the child");
		assert.equal(result.trim(), REDACTED);
		assert.equal(
			process.env.OPENAI_API_KEY,
			sentinel,
			"the agent's own env is untouched, so its OpenAI auth still works",
		);
	} finally {
		if (original === undefined) {
			delete process.env.OPENAI_API_KEY;
		} else {
			process.env.OPENAI_API_KEY = original;
		}
	}
});

test("runProcess runs in the given working directory", async () => {
	const result = await runProcess("pwd", { cwd: "/tmp" });
	assert.match(result, /tmp/);
});

test("runProcess truncates oversized output", async () => {
	const result = await runProcess(
		`node -e "process.stdout.write('x'.repeat(50000))"`,
		{ maxOutputChars: 1000 },
	);

	assert.ok(result.length < 1200, `got ${result.length} chars`);
	assert.match(result, /\[truncated \d+ characters\]/);
});

test("runProcess resolves rather than throwing for an unknown command", async () => {
	const result = await runProcess("this-command-does-not-exist-xyz");
	assert.match(result, /Command failed/);
});
